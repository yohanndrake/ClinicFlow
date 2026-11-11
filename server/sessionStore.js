//sessionStore.js - keeps login sessions in the database (sessions table) instead of in the
//server's memory, so people stay logged in when the server restarts

//imports: express-session (for its Store base class) and the database pool
const session = require("express-session");
const pool = require("./db");

//how long a session lasts when its cookie has no end time of its own
const DEFAULT_MS = 1000 * 60 * 60 * 8;

//when the session ends: the cookie's own end time, or 8 hours from now
function expiryOf(sess) {
  const expires = sess && sess.cookie && sess.cookie.expires;
  return expires ? new Date(expires) : new Date(Date.now() + DEFAULT_MS);
}

//the store express-session calls to load, save and remove sessions
class DatabaseStore extends session.Store {
  //load one session by its ID, ignoring sessions that have run out
  get(sid, callback) {
    pool
      .query("SELECT sess FROM sessions WHERE sid = $1 AND expire > NOW()", [
        sid,
      ])
      .then(({ rows }) => callback(null, rows[0] ? rows[0].sess : null))
      .catch(callback);
  }

  //save a session: add it, or replace it when the ID is already there
  set(sid, sess, callback) {
    pool
      .query(
        `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, JSON.stringify(sess), expiryOf(sess)],
      )
      .then(() => callback && callback(null))
      .catch((err) => callback && callback(err));
  }

  //remove one session (logout, or an account being logged out everywhere)
  destroy(sid, callback) {
    pool
      .query("DELETE FROM sessions WHERE sid = $1", [sid])
      .then(() => callback && callback(null))
      .catch((err) => callback && callback(err));
  }

  //called on every request to keep a session alive. The login cookie ends 8 hours after login
  //and is not renewed, so there is nothing to update, and skipping it saves a query per request
  touch(sid, sess, callback) {
    if (callback) callback(null);
  }

  //list every live session by its ID, used to log one account out on all devices
  all(callback) {
    pool
      .query("SELECT sid, sess FROM sessions WHERE expire > NOW()")
      .then(({ rows }) => {
        const sessions = {};
        for (const row of rows) sessions[row.sid] = row.sess;
        callback(null, sessions);
      })
      .catch(callback);
  }

  //delete sessions that have run out, and return how many were removed
  async clearExpired() {
    const result = await pool.query(
      "DELETE FROM sessions WHERE expire <= NOW()",
    );
    return result.rowCount;
  }
}

//share the store with server.js
module.exports = DatabaseStore;
