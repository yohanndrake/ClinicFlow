//routes/auth.js - register, login, logout, who am i, profile and change password

//imports: Express, bcrypt (password hashing), the database, the guards and the helpers.
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const {
  requireLogin,
  blockIfMustChangePassword,
  endSessions,
} = require("../middleware/auth");
const {
  ROLES,
  emailInUse,
  PASSWORD_RULE,
  isStrongPassword,
  isValidContact,
  NAME_RULE,
  isFullName,
} = require("../helpers");

const router = express.Router();

//a simple email pattern: text, an @, text, a dot, text, with no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//limit login attempts: lock an IP and email for 15 minutes after 5 wrong passwords.
//the email alone is also locked after 20 wrong passwords, in case the attempts come from many IP addresses
const MAX_FAILED_LOGINS = 5;
const MAX_FAILED_EMAIL = 20;

//the same counter also limits new accounts (20 per IP address in 15 minutes)
//and wrong current passwords on the change password page (5 per account)
const MAX_REGISTRATIONS = 20;
const LOCK_MS = 15 * 60 * 1000;
const failedLogins = new Map();

//return seconds left on a login lock, or 0 if not locked, and clear expired locks
function lockedSeconds(key) {
  const entry = failedLogins.get(key);
  if (!entry || !entry.lockedUntil) return 0;
  if (entry.lockedUntil <= Date.now()) {
    failedLogins.delete(key);
    return 0;
  }
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

//record a failed login, lock after too many failures (5 unless told otherwise), and clear old entries when the map gets large
function recordFailedLogin(key, max = MAX_FAILED_LOGINS) {
  const now = Date.now();
  if (failedLogins.size > 5000) {
    for (const [k, e] of failedLogins)
      if (now - e.since > LOCK_MS) failedLogins.delete(k);
  }
  let entry = failedLogins.get(key);
  if (!entry || now - entry.since > LOCK_MS)
    entry = { count: 0, since: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= max) entry.lockedUntil = now + LOCK_MS;
  failedLogins.set(key, entry);
}

//send a 429 "too many attempts" reply with the wait time
const tooManyAttempts = (res, seconds) =>
  res.status(429).json({
    error: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
    retry_after_seconds: seconds,
  });

//start a new session with a new ID before logging someone in, so an ID set before login cannot be reused
const newSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );

//register a patient: validate the form, hash the password, create the account and log them in
router.post("/register", async (req, res, next) => {
  try {
    //check the registration fields: required values, email shape, password strength and contact number
    //stop when this IP address has already created too many accounts in the last 15 minutes
    const registerKey = `register|${req.ip}`;
    const locked = lockedSeconds(registerKey);
    if (locked) return tooManyAttempts(res, locked);

    const { full_name, email, password, contact_number } = req.body || {};
    if (!full_name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email and password are required" });
    }

    //name, email and password must be text, and the email must fit the database column (100 characters)
    if (
      typeof full_name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "Name, email and password must be text" });
    }
    if (!isFullName(full_name))
      return res.status(400).json({ error: NAME_RULE });
    if (!EMAIL_RE.test(email) || email.trim().length > 100)
      return res.status(400).json({ error: "Invalid email" });
    if (!isStrongPassword(password))
      return res.status(400).json({ error: PASSWORD_RULE });
    if (contact_number && !isValidContact(String(contact_number))) {
      return res
        .status(400)
        .json({
          error: "Contact number can only contain digits, spaces, + - ( )",
        });
    }

    //the email must not exist in any of the three account tables (409 = conflict)
    if (await emailInUse(pool, email.trim().toLowerCase())) {
      return res.status(409).json({ error: "Email already registered" });
    }

    //never store the password itself. bcrypt makes a one-way hash (10 = work factor), and only the hash is saved
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO patients (full_name, email, password_hash, contact_number)
       VALUES ($1, $2, $3, $4) RETURNING patient_id`,
      [
        full_name.trim().slice(0, 100),
        email.trim().toLowerCase(),
        hash,
        contact_number || null,
      ],
    );

    //count this new account for the IP address
    recordFailedLogin(registerKey, MAX_REGISTRATIONS);

    //log the new patient in by saving them to a new session
    await newSession(req);
    req.session.user = {
      id: rows[0].patient_id,
      role: "patient",
      name: full_name.trim().slice(0, 100),
      mustChangePassword: false,
    };
    res.status(201).json({ user: req.session.user });
  } catch (err) {
    //if two people register the same email at once, the database rejects the second one
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    next(err);
  }
});

//check the email and password across all role tables, and start a session if they match
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    //clean the email, then build the lock keys: one for the IP and email, one for the email alone
    const cleanEmail = String(email).trim().toLowerCase();
    const key = `${req.ip}|${cleanEmail}`;
    const emailKey = `email|${cleanEmail}`;

    //if this IP and email, or the email alone, are currently locked, stop here.
    const locked = lockedSeconds(key) || lockedSeconds(emailKey);
    if (locked) return tooManyAttempts(res, locked);

    //try each role's table for the email, then check the password and start the session
    for (const [role, { table, idCol }] of Object.entries(ROLES)) {
      const { rows } = await pool.query(
        `SELECT ${idCol} AS id, full_name, password_hash, status, must_change_password
           FROM ${table} WHERE email = $1`,
        [cleanEmail],
      );
      const row = rows[0];

      //not in this table: try the next role.
      if (!row) continue;

      //check the password against the stored hash, and refuse deactivated accounts
      if (!(await bcrypt.compare(String(password), row.password_hash))) break;
      if (row.status !== "active") {
        return res
          .status(403)
          .json({
            error: "Account is deactivated. Please contact the clinic.",
          });
      }

      //correct password: clear the failed attempts, save the user to a new session, and return them
      failedLogins.delete(key);
      failedLogins.delete(emailKey);
      await newSession(req);
      req.session.user = {
        id: row.id,
        role,
        name: row.full_name,
        mustChangePassword: !!row.must_change_password,
      };
      return res.json({ user: req.session.user });
    }

    //count the failed attempt, then reply 401, or 429 if this attempt triggered the lock
    recordFailedLogin(key);
    recordFailedLogin(emailKey, MAX_FAILED_EMAIL);
    const nowLocked = lockedSeconds(key) || lockedSeconds(emailKey);
    if (nowLocked) return tooManyAttempts(res, nowLocked);
    res.status(401).json({ error: "Invalid email or password" });
  } catch (err) {
    next(err);
  }
});

//log out: destroy the server session and clear the cookie
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

//return the logged-in user, so each page knows whether to show or redirect
router.get("/me", requireLogin, (req, res) => {
  res.json({ user: req.session.user });
});

//get the logged-in user's own details from their role's table
router.get(
  "/profile",
  requireLogin,
  blockIfMustChangePassword,
  async (req, res, next) => {
    try {
      const { id, role } = req.session.user;
      const { table, idCol } = ROLES[role];
      const { rows } = await pool.query(
        `SELECT full_name, email, contact_number, created_at FROM ${table} WHERE ${idCol} = $1`,
        [id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Account not found" });
      res.json({ profile: { ...rows[0], role } });
    } catch (err) {
      next(err);
    }
  },
);

//edit your own name and contact number, then refresh the name in the session
router.patch(
  "/profile",
  requireLogin,
  blockIfMustChangePassword,
  async (req, res, next) => {
    try {
      const { id, role } = req.session.user;
      const { table, idCol } = ROLES[role];
      const { rows } = await pool.query(
        `SELECT full_name, contact_number FROM ${table} WHERE ${idCol} = $1`,
        [id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Account not found" });

      //use the new name and contact number if sent, otherwise keep the current ones
      const b = req.body || {};
      const fullName =
        b.full_name !== undefined
          ? String(b.full_name).trim()
          : rows[0].full_name;
      const contact =
        b.contact_number !== undefined
          ? String(b.contact_number || "").trim() || null
          : rows[0].contact_number;

      //name is required (max 100 characters) and the contact number must use allowed characters
      if (!fullName || fullName.length > 100) {
        return res
          .status(400)
          .json({ error: "Full name is required (max 100 characters)" });
      }
      //a new name needs a first and last name
      if (b.full_name !== undefined && !isFullName(fullName)) {
        return res.status(400).json({ error: NAME_RULE });
      }
      if (contact && !isValidContact(contact)) {
        return res
          .status(400)
          .json({
            error: "Contact number can only contain digits, spaces, + - ( )",
          });
      }

      await pool.query(
        `UPDATE ${table} SET full_name = $1, contact_number = $2 WHERE ${idCol} = $3`,
        [fullName, contact, id],
      );

      //update the name stored in the session too, so the header shows it right away
      req.session.user.name = fullName;
      res.json({ ok: true, user: req.session.user });
    } catch (err) {
      next(err);
    }
  },
);

//change your password after checking the current one, then log out so you sign in again
router.post("/change-password", requireLogin, async (req, res, next) => {
  try {
    //check both passwords are sent, the new one is strong, and it differs from the old one
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ error: "Current and new password are required" });
    }
    if (!isStrongPassword(new_password))
      return res.status(400).json({ error: PASSWORD_RULE });
    if (current_password === new_password) {
      return res
        .status(400)
        .json({
          error: "New password must be different from the current password",
        });
    }

    const { id, role } = req.session.user;
    const { table, idCol } = ROLES[role];

    //stop when this account already had 5 wrong current passwords in the last 15 minutes
    const passwordKey = `password|${role}|${id}`;
    const locked = lockedSeconds(passwordKey);
    if (locked) return tooManyAttempts(res, locked);

    const { rows } = await pool.query(
      `SELECT password_hash FROM ${table} WHERE ${idCol} = $1`,
      [id],
    );
    if (
      !rows[0] ||
      !(await bcrypt.compare(String(current_password), rows[0].password_hash))
    ) {
      //count the wrong attempt, then reply 401, or 429 if this attempt triggered the lock
      recordFailedLogin(passwordKey);
      const nowLocked = lockedSeconds(passwordKey);
      if (nowLocked) return tooManyAttempts(res, nowLocked);
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    failedLogins.delete(passwordKey);

    //hash the new password, save it and clear the forced-change flag
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE ${table} SET password_hash = $1, must_change_password = FALSE WHERE ${idCol} = $2`,
      [hash, id],
    );

    //log the account out on every other device too
    await endSessions(req, role, id);

    //end the session and clear the cookie, then tell the page it was logged out
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true, logged_out: true });
    });
  } catch (err) {
    next(err);
  }
});

//share the router with server.js
module.exports = router;
