// Small functions shared by the patient, staff, admin and public routes.
const crypto = require('crypto');
const pool = require('./db');

/* ---------- clinic time and settings ---------- */

// Current date (YYYY-MM-DD) and time (HH:MM:SS) in the clinic's time zone.
function clinicNow(timeZone) {
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-CA', { timeZone }),
    time: now.toLocaleTimeString('en-GB', { timeZone, hour12: false }),
  };
}

async function getSettings(db) {
  const { rows } = await db.query('SELECT * FROM clinic_settings LIMIT 1');
  return rows[0];
}

/* ---------- tickets and services ---------- */

// e.g. prefix "G" + number 7 -> "G-007"
function ticketLabel(t) {
  return `${t.prefix}-${String(t.queue_number).padStart(3, '0')}`;
}

// Is the service taking new tickets right now? Returns null if yes, otherwise the reason why not.
function unavailableReason(service, time) {
  if (service.queue_status === 'paused') {
    return `Paused${service.status_note ? ` - ${service.status_note}` : ''}`;
  }
  if (service.queue_status === 'closed') return 'Closed';
  if (time < service.open_time || time >= service.close_time) return 'Outside opening hours';
  return null;
}

// SQL snippets: minutes between two timestamp columns, rounded to 1 decimal (NULL if either is missing).
const minutesBetween = (later, earlier) =>
  `ROUND((EXTRACT(EPOCH FROM (${later} - ${earlier})) / 60)::numeric, 1)::float8`;
const WAIT_MINUTES = minutesBetween('t.called_at', 't.queued_at');
const SERVICE_MINUTES = minutesBetween('t.completed_at', 't.called_at');

/* ---------- database transactions ---------- */

// Runs fn(client) inside a database transaction (all changes succeed or none do).
// fn returns { status, body } to send back; a status of 400 or more rolls everything back.
async function inTransaction(res, next, fn) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query(out.status >= 400 ? 'ROLLBACK' : 'COMMIT');
    res.status(out.status).json(out.body);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
}

// Shortcut for returning an error from inside inTransaction.
const fail = (status, error) => ({ status, body: { error } });

/* ---------- accounts ---------- */

// The three kinds of account, and the table + id column each one lives in.
const ROLES = {
  patient: { table: 'patients', idCol: 'patient_id' },
  staff: { table: 'staff', idCol: 'staff_id' },
  admin: { table: 'admins', idCol: 'admin_id' },
};

// True if any account (of any role) already uses this email.
// `except` = { role, id } skips one account, for when someone edits their own email.
async function emailInUse(db, email, except) {
  const { rows } = await db.query(
    `SELECT 'patient' AS role, patient_id AS id FROM patients WHERE email = $1
     UNION ALL SELECT 'staff', staff_id FROM staff WHERE email = $1
     UNION ALL SELECT 'admin', admin_id FROM admins WHERE email = $1`,
    [email]
  );
  return rows.some(r => !(except && r.role === except.role && r.id === except.id));
}

const PASSWORD_RULE = 'Password must be at least 8 characters and include a letter and a number';
const isStrongPassword = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

// A random temporary password that passes the rule above.
function randomPassword() {
  for (;;) {
    const p = crypto.randomBytes(9).toString('base64url');
    if (isStrongPassword(p)) return p;
  }
}

const isValidContact = v => /^[0-9+()\-\s]{0,20}$/.test(v);

/* ---------- request parsing ---------- */

const toId = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// Date `days` days before the given YYYY-MM-DD.
function daysBefore(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ?page=2&page_size=20  ->  { page, pageSize, offset }
function parsePage(query, defaultSize = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const pagination = (total, { page, pageSize }) => ({
  total, page, page_size: pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
});

/* ---------- CSV export ---------- */

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheets running text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ label, get: row => value }]
function toCsv(columns, rows) {
  const lines = [columns.map(c => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map(c => csvCell(c.get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}

function sendCsv(res, filename, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.send(csv);
}

module.exports = {
  clinicNow, getSettings, ticketLabel, unavailableReason, WAIT_MINUTES, SERVICE_MINUTES,
  inTransaction, fail, ROLES, emailInUse, PASSWORD_RULE, isStrongPassword, randomPassword,
  isValidContact, toId, isDate, daysBefore, parsePage, pagination, toCsv, sendCsv,
};
