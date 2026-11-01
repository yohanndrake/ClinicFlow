const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireLogin, blockIfMustChangePassword } = require('../middleware/auth');
const { ROLES, emailInUse, PASSWORD_RULE, isStrongPassword, isValidContact } = require('../helpers');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- login attempt limit ---------- */
// After 5 wrong logins for the same email from the same address, login is locked for 15 minutes.
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const failedLogins = new Map(); // "address|email" -> { count, since, lockedUntil }

// Seconds left on a lock (0 if not locked).
function lockedSeconds(key) {
  const entry = failedLogins.get(key);
  if (!entry || !entry.lockedUntil) return 0;
  if (entry.lockedUntil <= Date.now()) {
    failedLogins.delete(key);
    return 0;
  }
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

function recordFailedLogin(key) {
  const now = Date.now();
  if (failedLogins.size > 5000) {
    for (const [k, e] of failedLogins) if (now - e.since > LOCK_MS) failedLogins.delete(k);
  }
  let entry = failedLogins.get(key);
  if (!entry || now - entry.since > LOCK_MS) entry = { count: 0, since: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_LOGINS) entry.lockedUntil = now + LOCK_MS;
  failedLogins.set(key, entry);
}

const tooManyAttempts = (res, seconds) =>
  res.status(429).json({
    error: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
    retry_after_seconds: seconds,
  });

/* ---------- routes ---------- */

// POST /api/auth/register  (patients only)
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, password, contact_number } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (!isStrongPassword(password)) return res.status(400).json({ error: PASSWORD_RULE });
    if (contact_number && !isValidContact(String(contact_number))) {
      return res.status(400).json({ error: 'Contact number can only contain digits, spaces, + - ( )' });
    }

    // An email can only belong to one account across patients, staff and admins.
    if (await emailInUse(pool, email.trim().toLowerCase())) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO patients (full_name, email, password_hash, contact_number)
       VALUES ($1, $2, $3, $4) RETURNING patient_id`,
      [full_name.trim().slice(0, 100), email.trim().toLowerCase(), hash, contact_number || null]
    );

    req.session.user = {
      id: rows[0].patient_id, role: 'patient', name: full_name.trim().slice(0, 100), mustChangePassword: false,
    };
    res.status(201).json({ user: req.session.user });
  } catch (err) {
    if (err.code === '23505') { // Postgres "unique violation"
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(err);
  }
});

// POST /api/auth/login  body: { email, password }
// One login form for all roles: look the email up in each table.
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const key = `${req.ip}|${cleanEmail}`;

    const locked = lockedSeconds(key);
    if (locked) return tooManyAttempts(res, locked);

    for (const [role, { table, idCol }] of Object.entries(ROLES)) {
      const { rows } = await pool.query(
        `SELECT ${idCol} AS id, full_name, password_hash, status, must_change_password
           FROM ${table} WHERE email = $1`,
        [cleanEmail]
      );
      const row = rows[0];
      if (!row) continue;

      if (!(await bcrypt.compare(String(password), row.password_hash))) break;
      if (row.status !== 'active') {
        return res.status(403).json({ error: 'Account is deactivated. Please contact the clinic.' });
      }

      failedLogins.delete(key);
      req.session.user = {
        id: row.id, role, name: row.full_name, mustChangePassword: !!row.must_change_password,
      };
      return res.json({ user: req.session.user });
    }

    recordFailedLogin(key);
    const nowLocked = lockedSeconds(key);
    if (nowLocked) return tooManyAttempts(res, nowLocked);
    res.status(401).json({ error: 'Invalid email or password' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireLogin, (req, res) => {
  res.json({ user: req.session.user });
});

// GET /api/auth/profile  - the logged-in user's own details
router.get('/profile', requireLogin, blockIfMustChangePassword, async (req, res, next) => {
  try {
    const { id, role } = req.session.user;
    const { table, idCol } = ROLES[role];
    const { rows } = await pool.query(
      `SELECT full_name, email, contact_number, created_at FROM ${table} WHERE ${idCol} = $1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({ profile: { ...rows[0], role } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/profile  body: { full_name?, contact_number? }  (email and role cannot be changed here)
router.patch('/profile', requireLogin, blockIfMustChangePassword, async (req, res, next) => {
  try {
    const { id, role } = req.session.user;
    const { table, idCol } = ROLES[role];
    const { rows } = await pool.query(
      `SELECT full_name, contact_number FROM ${table} WHERE ${idCol} = $1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });

    const b = req.body;
    const fullName = b.full_name !== undefined ? String(b.full_name).trim() : rows[0].full_name;
    const contact = b.contact_number !== undefined
      ? String(b.contact_number || '').trim() || null : rows[0].contact_number;

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ error: 'Full name is required (max 100 characters)' });
    }
    if (contact && !isValidContact(contact)) {
      return res.status(400).json({ error: 'Contact number can only contain digits, spaces, + - ( )' });
    }

    await pool.query(
      `UPDATE ${table} SET full_name = $1, contact_number = $2 WHERE ${idCol} = $3`,
      [fullName, contact, id]
    );
    req.session.user.name = fullName;
    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password  body: { current_password, new_password }
// On success the user is logged out and must log in again with the new password.
router.post('/change-password', requireLogin, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (!isStrongPassword(new_password)) return res.status(400).json({ error: PASSWORD_RULE });
    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    const { id, role } = req.session.user;
    const { table, idCol } = ROLES[role];
    const { rows } = await pool.query(
      `SELECT password_hash FROM ${table} WHERE ${idCol} = $1`, [id]
    );
    if (!rows[0] || !(await bcrypt.compare(String(current_password), rows[0].password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE ${table} SET password_hash = $1, must_change_password = FALSE WHERE ${idCol} = $2`,
      [hash, id]
    );
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true, logged_out: true });
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
