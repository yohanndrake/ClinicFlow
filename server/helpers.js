//helpers.js - small shared tools that many route files use (time, ticket labels,
// transactions, validation, paging).

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

//a waiting ticket is near when few people are ahead, or when the estimated wait is no longer than the patient's travel time
function isNear(ahead, avgServiceMinutes, travelMinutes, nearThreshold) {
  if (ahead < nearThreshold) return true;
  return travelMinutes != null && ahead * avgServiceMinutes <= travelMinutes;
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

//why a deleted ticket cannot be restored, or null if it can. A ticket that is still waiting or serving
//goes back into the queue, so it must be from today and the patient must have no other active ticket
async function restoreBlockedReason(db, t) {
  if (!["waiting", "serving"].includes(t.status)) return null;
  const settings = await getSettings(db);
  const { date } = clinicNow(settings.time_zone);
  if (t.queue_date !== date)
    return "Only tickets from today can be restored while waiting or serving";
  if (!t.patient_id) return null;
  const { rows: active } = await db.query(
    `SELECT ticket_id FROM tickets
      WHERE patient_id = $1 AND queue_date = $2 AND status IN ('waiting','serving')
        AND is_deleted = FALSE AND ticket_id <> $3`,
    [t.patient_id, date, t.ticket_id],
  );
  return active.length ? "This patient already has another active ticket" : null;
}

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

//checks if the full name has at least two words (first and last name).
const NAME_RULE = "Enter your first and last name";
const isFullName = (v) => /^\S+(\s+\S+)+$/.test(String(v).trim());

//input checks - it turns a value into a valid ID or null, and confirm a YYYY-MM-DD date.
//the date must be a real calendar day: 2026-02-31 rolls over to March, so it must read back the same
const toId = (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;

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

//share everything with the other files.
module.exports = {
  clinicNow,
  getSettings,
  ticketLabel,
  isNear,
  unavailableReason,
  WAIT_MINUTES,
  SERVICE_MINUTES,
  inTransaction,
  fail,
  restoreBlockedReason,
  ROLES,
  emailInUse,
  PASSWORD_RULE,
  isStrongPassword,
  randomPassword,
  isValidContact,
  NAME_RULE,
  isFullName,
  toId,
  isDate,
  daysBefore,
  parsePage,
  pagination,
};
