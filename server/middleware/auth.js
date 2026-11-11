//auth.js - checks login, role, and password change status

//checks if logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

//checks if the user has one of the required roles
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

//after the admin resets a user's password, the user must change it
function blockIfMustChangePassword(req, res, next) {
  const user = req.session.user;
  if (user && user.mustChangePassword) {
    return res
      .status(403)
      .json({ error: "Password change required", mustChangePassword: true });
  }
  next();
}

//end every session of one account, on all devices, so a deactivated account or a changed
//password logs that person out right away instead of when the session runs out
function endSessions(req, role, id) {
  const store = req.sessionStore;
  return new Promise((resolve, reject) => {
    store.all((err, sessions) => {
      if (err) return reject(err);

      //find the session IDs that belong to this account
      const ids = Object.keys(sessions || {}).filter((sid) => {
        const user = sessions[sid] && sessions[sid].user;
        return user && user.role === role && user.id === id;
      });
      if (!ids.length) return resolve();

      //remove them one by one, and finish when the last one is gone
      let left = ids.length;
      let failed = null;
      for (const sid of ids) {
        store.destroy(sid, (destroyErr) => {
          failed = failed || destroyErr;
          left -= 1;
          if (left === 0) (failed ? reject(failed) : resolve());
        });
      }
    });
  });
}

//shares the three guards and the session cleaner with the route files.
module.exports = {
  requireLogin,
  requireRole,
  blockIfMustChangePassword,
  endSessions,
};
