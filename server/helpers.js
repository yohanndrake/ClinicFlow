//helpers.js - small shared tools that many route files use (time, ticket labels,
// transactions, validation, paging, CSV).

//crypto makes random passwords, pool is the database connection.
const crypto = require("crypto");
const pool = require("./db");

//checks the current time zone but converts it to a date and time string
function clinicNow(timeZone) {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-CA", { timeZone }),
    time: now.toLocaleTimeString("en-GB", { timeZone, hour12: false }),
  };
}

//reads the clinnic settings from the database
async function getSettings(db) {
  const { rows } = await db.query("SELECT * FROM clinic_settings LIMIT 1");
  return rows[0];
}

//builds the display label for a ticket
function ticketLabel(t) {
  return `${t.prefix}-${String(t.queue_number).padStart(3, "0")}`;
}

//checks if a patient can take a service at a given time
function unavailableReason(service, time) {
  if (service.queue_status === "paused") {
    return `Paused${service.status_note ? ` - ${service.status_note}` : ""}`;
  }
  if (service.queue_status === "closed") return "Closed";
  if (time < service.open_time || time >= service.close_time)
    return "Outside opening hours";
  return null;
}

//calculates the waiting time and service time of past tickets
const minutesBetween = (later, earlier) =>
  `ROUND((EXTRACT(EPOCH FROM (${later} - ${earlier})) / 60)::numeric, 1)::float8`;
const WAIT_MINUTES = minutesBetween("t.called_at", "t.queued_at");
const SERVICE_MINUTES = minutesBetween("t.completed_at", "t.called_at");

//save all updates together, or undo them all if anything fails.
async function inTransaction(res, next, fn) {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query(out.status >= 400 ? "ROLLBACK" : "COMMIT");
    res.status(out.status).json(out.body);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
}

//shortcut for an error result
const fail = (status, error) => ({ status, body: { error } });

//maps each role to its account table and ID column.
const ROLES = {
  patient: { table: "patients", idCol: "patient_id" },
  staff: { table: "staff", idCol: "staff_id" },
  admin: { table: "admins", idCol: "admin_id" },
};

//check if an email is already used by any account, ignoring the person's own.
async function emailInUse(db, email, except) {
  const { rows } = await db.query(
    `SELECT 'patient' AS role, patient_id AS id FROM patients WHERE email = $1
     UNION ALL SELECT 'staff', staff_id FROM staff WHERE email = $1
     UNION ALL SELECT 'admin', admin_id FROM admins WHERE email = $1`,
    [email],
  );
  return rows.some(
    (r) => !(except && r.role === except.role && r.id === except.id),
  );
}

//checks if password is at least 8 characters with at least one letter and one number.
const PASSWORD_RULE =
  "Password must be at least 8 characters and include a letter and a number";
const isStrongPassword = (p) =>
  typeof p === "string" && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

//makes a temporary password (used when an admin resets or creates an account).
function randomPassword() {
  for (;;) {
    const p = crypto.randomBytes(9).toString("base64url");
    if (isStrongPassword(p)) return p;
  }
}

//checks if the contact number up to 20 characters are  made of digits, + ( ) - and spaces.
const isValidContact = (v) => /^[0-9+()\-\s]{0,20}$/.test(v);

//input checks - it turns a value into a valid ID or null, and confirm a YYYY-MM-DD date.
const toId = (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s));

//subtract days from a YYYY-MM-DD date, for the 7-day and 30-day dashboard ranges.
function daysBefore(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

//read the page number and page size from the url, and work out where to start.
function parsePage(query, defaultSize = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(query.page_size, 10) || defaultSize),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

//describe a page of results: total rows, current page, page size, and page count.
const pagination = (total, { page, pageSize }) => ({
  total,
  page,
  page_size: pageSize,
  pages: Math.max(1, Math.ceil(total / pageSize)),
});

//turns one value into safe text for a csv cell
function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

//build the whole csv text
function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows)
    lines.push(columns.map((c) => csvCell(c.get(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}

//send the csv text to the browser as a downloadable file.
function sendCsv(res, filename, csv) {
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.send(csv);
}

//share everything with the other files.
module.exports = {
  clinicNow,
  getSettings,
  ticketLabel,
  unavailableReason,
  WAIT_MINUTES,
  SERVICE_MINUTES,
  inTransaction,
  fail,
  ROLES,
  emailInUse,
  PASSWORD_RULE,
  isStrongPassword,
  randomPassword,
  isValidContact,
  toId,
  isDate,
  daysBefore,
  parsePage,
  pagination,
  toCsv,
  sendCsv,
};
