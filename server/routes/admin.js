const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireRole, blockIfMustChangePassword } = require('../middleware/auth');
const {
  clinicNow, getSettings, ticketLabel, inTransaction, fail, ROLES, emailInUse, PASSWORD_RULE,
  isStrongPassword, randomPassword, isValidContact, toId, isDate, daysBefore, parsePage, pagination,
  toCsv, sendCsv,
} = require('../helpers');
const { checkNearAlerts, notifyPatient, notifyPaused } = require('../notifications');
const { searchTickets, ticketDetails } = require('../records');

const router = express.Router();
router.use(requireRole('admin'), blockIfMustChangePassword);

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKET_STATUSES = ['waiting', 'serving', 'completed', 'skipped', 'cancelled'];

const round1 = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const fullTime = t => (t.length === 5 ? `${t}:00` : t); // "08:00" -> "08:00:00"
const bodyOf = req => req.body || {};
const escapeLike = s => s.replace(/[\\%_]/g, '\\$&');

/* ------------------------------------------------------------------ */
/* Dashboard and reports                                               */
/* ------------------------------------------------------------------ */

// Patients and average waiting time for each day in a date range (days with no tickets show 0).
async function dailyStats(db, from, to, serviceId) {
  const { rows } = await db.query(
    `SELECT d::date AS date,
            COUNT(t.ticket_id) AS patients,
            AVG(EXTRACT(EPOCH FROM (t.called_at - t.queued_at)) / 60)::float8 AS avg_wait_minutes
       FROM generate_series($1::date, $2::date, '1 day') d
       LEFT JOIN tickets t ON t.queue_date = d::date AND t.is_deleted = FALSE
                          AND ($3::int IS NULL OR t.service_id = $3::int)
      GROUP BY d ORDER BY d`,
    [from, to, serviceId]
  );
  return rows.map(r => ({ ...r, avg_wait_minutes: round1(r.avg_wait_minutes) }));
}

// Totals for a date range: tickets by status, average wait and average time with the doctor.
async function rangeTotals(db, from, to, serviceId) {
  const { rows: byStatus } = await db.query(
    `SELECT status, COUNT(*) AS n FROM tickets
      WHERE queue_date BETWEEN $1::date AND $2::date AND is_deleted = FALSE
        AND ($3::int IS NULL OR service_id = $3::int)
      GROUP BY status`,
    [from, to, serviceId]
  );
  const counts = { waiting: 0, serving: 0, completed: 0, skipped: 0, cancelled: 0, total: 0 };
  for (const r of byStatus) { counts[r.status] = r.n; counts.total += r.n; }

  const { rows } = await db.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (called_at - queued_at)) / 60)::float8 AS wait,
            AVG(EXTRACT(EPOCH FROM (completed_at - called_at)) / 60)::float8 AS service
       FROM tickets
      WHERE queue_date BETWEEN $1::date AND $2::date AND is_deleted = FALSE
        AND ($3::int IS NULL OR service_id = $3::int)`,
    [from, to, serviceId]
  );
  return { ...counts, avg_wait_minutes: round1(rows[0].wait), avg_service_minutes: round1(rows[0].service) };
}

// GET /api/admin/dashboard?range=today|7|30
router.get('/dashboard', async (req, res, next) => {
  try {
    const range = req.query.range || 'today';
    if (!['today', '7', '30'].includes(range)) {
      return res.status(400).json({ error: 'range must be today, 7 or 30' });
    }
    const settings = await getSettings(pool);
    const { date } = clinicNow(settings.time_zone);
    const from = range === 'today' ? date : daysBefore(date, Number(range) - 1);

    // Live look at each service, right now.
    const { rows: services } = await pool.query(
      `SELECT s.service_id, s.service_name, s.prefix, s.queue_status, s.status_note, s.open_time, s.close_time,
              COUNT(t.ticket_id) FILTER (WHERE t.status = 'waiting')   AS waiting,
              COUNT(t.ticket_id) FILTER (WHERE t.status = 'serving')   AS serving,
              COUNT(t.ticket_id) FILTER (WHERE t.status = 'completed') AS completed,
              MIN(t.queue_number) FILTER (WHERE t.status = 'serving')  AS serving_number
         FROM services s
         LEFT JOIN tickets t ON t.service_id = s.service_id AND t.queue_date = $1 AND t.is_deleted = FALSE
        WHERE s.is_active = TRUE GROUP BY s.service_id ORDER BY s.service_name`,
      [date]
    );

    res.json({
      date, range, from, to: date,
      totals: await rangeTotals(pool, from, date, null),
      today: await rangeTotals(pool, date, date, null),
      services: services.map(({ serving_number, ...s }) => ({
        ...s,
        now_serving: serving_number ? ticketLabel({ prefix: s.prefix, queue_number: serving_number }) : null,
      })),
      // The chart always shows at least the last 7 days.
      daily: await dailyStats(pool, range === '30' ? from : daysBefore(date, 6), date, null),
    });
  } catch (err) {
    next(err);
  }
});

// Reads and checks ?from&to&service_id for the report routes.
async function reportParams(req) {
  const settings = await getSettings(pool);
  const today = clinicNow(settings.time_zone).date;
  const to = req.query.to || today;
  const from = req.query.from || daysBefore(to, 29);
  const serviceId = req.query.service_id ? toId(req.query.service_id) : null;

  if (!isDate(from) || !isDate(to)) return { error: 'from and to must look like YYYY-MM-DD' };
  if (from > to) return { error: 'from must not be after to' };
  if (daysBefore(to, 366) > from) return { error: 'Range is limited to one year' };
  if (req.query.service_id && !serviceId) return { error: 'Invalid service_id' };
  return { from, to, serviceId, timeZone: settings.time_zone };
}

async function buildReport({ from, to, serviceId, timeZone }) {
  const { rows: byService } = await pool.query(
    `SELECT s.service_id, s.service_name,
            COUNT(t.ticket_id) AS total,
            COUNT(t.ticket_id) FILTER (WHERE t.status = 'completed') AS completed,
            COUNT(t.ticket_id) FILTER (WHERE t.status = 'skipped')   AS skipped,
            COUNT(t.ticket_id) FILTER (WHERE t.status = 'cancelled') AS cancelled,
            AVG(EXTRACT(EPOCH FROM (t.called_at - t.queued_at)) / 60)::float8 AS avg_wait_minutes
       FROM services s
       LEFT JOIN tickets t ON t.service_id = s.service_id AND t.is_deleted = FALSE
                          AND t.queue_date BETWEEN $1::date AND $2::date
      WHERE ($3::int IS NULL OR s.service_id = $3::int)
      GROUP BY s.service_id ORDER BY s.service_name`,
    [from, to, serviceId]
  );

  // How many people joined the queue in each hour of the day (0-23), in clinic time.
  const { rows: hours } = await pool.query(
    `SELECT EXTRACT(HOUR FROM t.queued_at AT TIME ZONE $4)::int AS hour, COUNT(*) AS n
       FROM tickets t
      WHERE t.queue_date BETWEEN $1::date AND $2::date AND t.is_deleted = FALSE
        AND ($3::int IS NULL OR t.service_id = $3::int)
      GROUP BY 1`,
    [from, to, serviceId, timeZone]
  );
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour, patients: (hours.find(h => h.hour === hour) || { n: 0 }).n,
  }));

  const totals = await rangeTotals(pool, from, to, serviceId);
  const { total, avg_wait_minutes, avg_service_minutes, ...statusBreakdown } = totals;
  return {
    from, to,
    total_patients: total,
    avg_wait_minutes,
    avg_service_minutes,
    status_breakdown: statusBreakdown,
    peak_hours: peakHours,
    daily: await dailyStats(pool, from, to, serviceId),
    by_service: byService.map(s => ({ ...s, avg_wait_minutes: round1(s.avg_wait_minutes) })),
  };
}

// GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD[&service_id=1]
router.get('/reports', async (req, res, next) => {
  try {
    const params = await reportParams(req);
    if (params.error) return res.status(400).json({ error: params.error });
    res.json(await buildReport(params));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/export  - the same report as a CSV file (one row per day)
router.get('/reports/export', async (req, res, next) => {
  try {
    const params = await reportParams(req);
    if (params.error) return res.status(400).json({ error: params.error });
    const report = await buildReport(params);
    sendCsv(res, `clinicflow-report-${report.from}-to-${report.to}.csv`, toCsv([
      { label: 'Date', get: r => r.date },
      { label: 'Patients', get: r => r.patients },
      { label: 'Average wait (minutes)', get: r => r.avg_wait_minutes },
    ], report.daily));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

const SERVICE_FIELDS = [
  'service_name', 'prefix', 'description', 'avg_service_minutes', 'open_time',
  'close_time', 'daily_limit', 'queue_status', 'status_note', 'is_active',
];

// Merges the request body onto the current values and validates the result.
// Returns { error } or { value }.
function cleanService(body, current = {}) {
  const v = { ...current };
  for (const k of SERVICE_FIELDS) if (body[k] !== undefined) v[k] = body[k];

  v.service_name = String(v.service_name || '').trim();
  if (!v.service_name || v.service_name.length > 100) return { error: 'service_name is required (max 100 characters)' };

  v.prefix = String(v.prefix || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(v.prefix)) return { error: 'prefix must be 1 to 3 letters' };

  v.description = v.description ? String(v.description).trim().slice(0, 255) || null : null;

  v.avg_service_minutes = Number(v.avg_service_minutes ?? 10);
  if (!Number.isInteger(v.avg_service_minutes) || v.avg_service_minutes < 1) {
    return { error: 'avg_service_minutes must be a whole number of 1 or more' };
  }

  if (!TIME_RE.test(String(v.open_time)) || !TIME_RE.test(String(v.close_time))) {
    return { error: 'open_time and close_time must look like HH:MM' };
  }
  v.open_time = fullTime(String(v.open_time));
  v.close_time = fullTime(String(v.close_time));
  if (v.open_time >= v.close_time) return { error: 'open_time must be before close_time' };

  if (v.daily_limit === '' || v.daily_limit === undefined) v.daily_limit = null;
  if (v.daily_limit !== null) {
    v.daily_limit = Number(v.daily_limit);
    if (!Number.isInteger(v.daily_limit) || v.daily_limit < 1) {
      return { error: 'daily_limit must be empty or a whole number of 1 or more' };
    }
  }

  v.queue_status = v.queue_status || 'open';
  if (!['open', 'paused', 'closed'].includes(v.queue_status)) {
    return { error: 'queue_status must be open, paused or closed' };
  }
  v.status_note = v.status_note ? String(v.status_note).trim().slice(0, 100) || null : null;
  v.is_active = v.is_active === undefined ? true : !!v.is_active;
  return { value: v };
}

// Makes the staff assigned to a service match the list [{ staff_id, counter_label? }].
// Staff not in the list are unassigned. Returns an error message or null.
async function syncServiceStaff(db, serviceId, list) {
  if (!Array.isArray(list)) return 'staff must be a list';
  const wanted = [];
  for (const item of list) {
    const staffId = toId(item && item.staff_id);
    if (!staffId) return 'Each staff entry needs a staff_id';
    const label = String(item.counter_label || '').trim().slice(0, 30);
    wanted.push({ staffId, label });
  }
  const ids = wanted.map(w => w.staffId);

  const { rows: found } = await db.query('SELECT staff_id FROM staff WHERE staff_id = ANY($1::int[])', [ids]);
  if (found.length !== new Set(ids).size) return 'Staff member not found';

  await db.query(
    'DELETE FROM staff_services WHERE service_id = $1 AND NOT (staff_id = ANY($2::int[]))', [serviceId, ids]
  );
  for (const w of wanted) {
    const { rows } = await db.query(
      'SELECT staff_service_id FROM staff_services WHERE service_id = $1 AND staff_id = $2', [serviceId, w.staffId]
    );
    if (rows[0]) {
      if (w.label) {
        await db.query('UPDATE staff_services SET counter_label = $1 WHERE staff_service_id = $2',
          [w.label, rows[0].staff_service_id]);
      }
    } else {
      await db.query(
        'INSERT INTO staff_services (counter_label, staff_id, service_id) VALUES ($1, $2, $3)',
        [w.label || 'Counter', w.staffId, serviceId]
      );
    }
  }
  return null;
}

// GET /api/admin/services[?q=search]  - every service (including inactive) with its staff
router.get('/services', async (req, res, next) => {
  try {
    const q = req.query.q ? `%${escapeLike(String(req.query.q))}%` : null;
    const { rows: services } = await pool.query(
      `SELECT * FROM services
        WHERE ($1::text IS NULL OR service_name ILIKE $1::text OR prefix ILIKE $1::text)
        ORDER BY service_name`,
      [q]
    );
    const { rows: assigned } = await pool.query(
      `SELECT ss.staff_service_id, ss.service_id, ss.staff_id, ss.counter_label, st.full_name
         FROM staff_services ss JOIN staff st ON st.staff_id = ss.staff_id
        ORDER BY st.full_name`
    );
    res.json({
      services: services.map(s => {
        const staff = assigned.filter(a => a.service_id === s.service_id);
        return { ...s, staff, staff_count: staff.length };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/services  (body may include staff: [{ staff_id, counter_label }])
router.post('/services', (req, res, next) => {
  const { error, value: v } = cleanService(bodyOf(req));
  if (error) return res.status(400).json({ error });

  inTransaction(res, next, async db => {
    let service;
    try {
      const { rows } = await db.query(
        `INSERT INTO services (service_name, prefix, description, avg_service_minutes, open_time,
                               close_time, daily_limit, queue_status, status_note, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [v.service_name, v.prefix, v.description, v.avg_service_minutes, v.open_time,
         v.close_time, v.daily_limit, v.queue_status, v.status_note, v.is_active]
      );
      service = rows[0];
    } catch (err) {
      if (err.code === '23505') return fail(409, 'Service name or prefix already exists');
      throw err;
    }
    if (req.body.staff !== undefined) {
      const staffError = await syncServiceStaff(db, service.service_id, req.body.staff);
      if (staffError) return fail(400, staffError);
    }
    return { status: 201, body: { service } };
  });
});

// PATCH /api/admin/services/:id  - edit, pause/open/close the queue, activate or deactivate
router.patch('/services/:id', (req, res, next) => {
  const id = toId(req.params.id);
  inTransaction(res, next, async db => {
    if (!id) return fail(404, 'Service not found');
    const { rows } = await db.query('SELECT * FROM services WHERE service_id = $1 FOR UPDATE', [id]);
    if (!rows[0]) return fail(404, 'Service not found');
    const current = rows[0];

    const { error, value: v } = cleanService(bodyOf(req), current);
    if (error) return fail(400, error);

    try {
      await db.query(
        `UPDATE services SET service_name = $1, prefix = $2, description = $3, avg_service_minutes = $4,
                open_time = $5, close_time = $6, daily_limit = $7, queue_status = $8,
                status_note = $9, is_active = $10 WHERE service_id = $11`,
        [v.service_name, v.prefix, v.description, v.avg_service_minutes, v.open_time,
         v.close_time, v.daily_limit, v.queue_status, v.status_note, v.is_active, id]
      );
    } catch (err) {
      if (err.code === '23505') return fail(409, 'Service name or prefix already exists');
      throw err;
    }

    if (bodyOf(req).staff !== undefined) {
      const staffError = await syncServiceStaff(db, id, req.body.staff);
      if (staffError) return fail(400, staffError);
    }

    // Tell waiting patients when a queue gets paused.
    if (v.queue_status === 'paused' && current.queue_status !== 'paused') {
      const settings = await getSettings(db);
      await notifyPaused(db, { ...v, service_id: id }, clinicNow(settings.time_zone).date);
    }
    return { status: 200, body: { ok: true } };
  });
});

// DELETE /api/admin/services/:id  - deactivates (tickets keep pointing at it)
router.delete('/services/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const result = id && await pool.query('UPDATE services SET is_active = FALSE WHERE service_id = $1', [id]);
    if (!result || !result.rowCount) return res.status(404).json({ error: 'Service not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/staff-services  body: { staff_id, service_id, counter_label }
router.post('/staff-services', async (req, res, next) => {
  try {
    const b = bodyOf(req);
    const staffId = toId(b.staff_id);
    const serviceId = toId(b.service_id);
    const label = String(b.counter_label || '').trim().slice(0, 30);
    if (!staffId || !serviceId || !label) {
      return res.status(400).json({ error: 'staff_id, service_id and counter_label are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO staff_services (counter_label, staff_id, service_id) VALUES ($1, $2, $3)
       RETURNING staff_service_id`,
      [label, staffId, serviceId]
    );
    res.status(201).json({ staff_service_id: rows[0].staff_service_id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Staff member is already assigned to this service' });
    if (err.code === '23503') return res.status(404).json({ error: 'Staff member or service not found' });
    next(err);
  }
});

// DELETE /api/admin/staff-services/:id
router.delete('/staff-services/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const result = id && await pool.query('DELETE FROM staff_services WHERE staff_service_id = $1', [id]);
    if (!result || !result.rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Users (patients, staff, admins)                                     */
/* ------------------------------------------------------------------ */

// Looks up :role in the URL; sends a 404 and returns null if it isn't one of the three.
function roleFromParams(req, res) {
  const role = req.params.role;
  if (!Object.hasOwn(ROLES, role)) {
    res.status(404).json({ error: 'Unknown role' });
    return null;
  }
  return role;
}

// Extra columns shown in the user list: staff get their assignments, patients get their visit counts.
const USER_EXTRAS = {
  patient: `,
    (SELECT COUNT(*) FROM tickets t WHERE t.patient_id = u.patient_id AND t.is_deleted = FALSE) AS visits,
    (SELECT MAX(t.queue_date) FROM tickets t WHERE t.patient_id = u.patient_id AND t.is_deleted = FALSE) AS last_visit`,
  staff: `,
    COALESCE((SELECT json_agg(json_build_object('service_id', s.service_id, 'service_name', s.service_name,
                                                'counter_label', ss.counter_label) ORDER BY s.service_name)
                FROM staff_services ss JOIN services s ON s.service_id = ss.service_id
               WHERE ss.staff_id = u.staff_id), '[]'::json) AS assignments`,
  admin: '',
};

// GET /api/admin/users?role=patient|staff|admin[&q=search][&status=active|inactive]
router.get('/users', async (req, res, next) => {
  try {
    const role = req.query.role || 'patient';
    if (!Object.hasOwn(ROLES, role)) return res.status(400).json({ error: 'role must be patient, staff or admin' });
    if (req.query.status && !['active', 'inactive'].includes(req.query.status)) {
      return res.status(400).json({ error: 'status must be active or inactive' });
    }
    const { table, idCol } = ROLES[role];
    const q = req.query.q ? `%${escapeLike(String(req.query.q))}%` : null;
    const { rows } = await pool.query(
      `SELECT u.${idCol} AS id, u.full_name, u.email, u.contact_number, u.status, u.must_change_password,
              u.created_at ${USER_EXTRAS[role]}
         FROM ${table} u
        WHERE ($1::text IS NULL OR u.full_name ILIKE $1::text OR u.email ILIKE $1::text)
          AND ($2::text IS NULL OR u.status::text = $2::text)
        ORDER BY u.full_name`,
      [q, req.query.status || null]
    );
    res.json({ role, users: rows });
  } catch (err) {
    next(err);
  }
});

// Puts a staff member on a service (or just renames their counter if they are already on it).
async function assignStaff(db, staffId, serviceId, label) {
  const { rows } = await db.query(
    'SELECT staff_service_id FROM staff_services WHERE staff_id = $1 AND service_id = $2', [staffId, serviceId]
  );
  if (rows[0]) {
    if (label) await db.query('UPDATE staff_services SET counter_label = $1 WHERE staff_service_id = $2', [label, rows[0].staff_service_id]);
  } else {
    await db.query(
      'INSERT INTO staff_services (counter_label, staff_id, service_id) VALUES ($1, $2, $3)',
      [label || 'Counter', staffId, serviceId]
    );
  }
}

// Checks the optional service_id + counter_label of a staff account. Returns { error } or { serviceId, label }.
async function readAssignment(db, b) {
  if (b.service_id === undefined || b.service_id === null || b.service_id === '') return { serviceId: null };
  const serviceId = toId(b.service_id);
  if (!serviceId) return { error: 'Invalid service_id' };
  const { rows } = await db.query('SELECT 1 FROM services WHERE service_id = $1', [serviceId]);
  if (!rows[0]) return { error: 'Service not found' };
  return { serviceId, label: String(b.counter_label || '').trim().slice(0, 30) };
}

// POST /api/admin/users  body: { role, full_name, email, contact_number?, password?, service_id?, counter_label? }
// Without a password a temporary one is made. The account must change it at first login.
router.post('/users', (req, res, next) => {
  const b = bodyOf(req);
  const email = String(b.email || '').trim().toLowerCase();
  const fullName = String(b.full_name || '').trim().slice(0, 100);
  const contact = b.contact_number ? String(b.contact_number).trim() : null;
  if (!Object.hasOwn(ROLES, b.role)) return res.status(400).json({ error: 'role must be patient, staff or admin' });
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (contact && !isValidContact(contact)) {
    return res.status(400).json({ error: 'Contact number can only contain digits, spaces, + - ( )' });
  }
  const password = b.password ? String(b.password) : randomPassword();
  if (!isStrongPassword(password)) return res.status(400).json({ error: PASSWORD_RULE });

  inTransaction(res, next, async db => {
    if (await emailInUse(db, email)) return fail(409, 'Email already registered');
    const assignment = b.role === 'staff' ? await readAssignment(db, b) : { serviceId: null };
    if (assignment.error) return fail(400, assignment.error);

    const { table, idCol } = ROLES[b.role];
    let id;
    try {
      const { rows } = await db.query(
        `INSERT INTO ${table} (full_name, email, password_hash, contact_number, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING ${idCol} AS id`,
        [fullName, email, await bcrypt.hash(password, 10), contact]
      );
      id = rows[0].id;
    } catch (err) {
      if (err.code === '23505') return fail(409, 'Email already registered');
      throw err;
    }
    if (assignment.serviceId) await assignStaff(db, id, assignment.serviceId, assignment.label);
    return { status: 201, body: { id, role: b.role, email, temporary_password: password } };
  });
});

// PATCH /api/admin/users/:role/:id
// body: { full_name?, email?, contact_number?, status?, service_id?, counter_label? }
router.patch('/users/:role/:id', (req, res, next) => {
  const role = roleFromParams(req, res);
  if (!role) return;
  const id = toId(req.params.id);
  const b = bodyOf(req);

  inTransaction(res, next, async db => {
    const { table, idCol } = ROLES[role];
    const { rows } = id ? await db.query(`SELECT * FROM ${table} WHERE ${idCol} = $1 FOR UPDATE`, [id]) : { rows: [] };
    if (!rows[0]) return fail(404, 'User not found');
    const cur = rows[0];

    const full_name = b.full_name !== undefined ? String(b.full_name).trim().slice(0, 100) : cur.full_name;
    const email = b.email !== undefined ? String(b.email).trim().toLowerCase() : cur.email;
    const contact = b.contact_number !== undefined
      ? String(b.contact_number || '').trim().slice(0, 20) || null : cur.contact_number;
    const status = b.status !== undefined ? b.status : cur.status;

    if (!full_name) return fail(400, 'full_name cannot be empty');
    if (!EMAIL_RE.test(email)) return fail(400, 'Invalid email');
    if (contact && !isValidContact(contact)) return fail(400, 'Contact number can only contain digits, spaces, + - ( )');
    if (!['active', 'inactive'].includes(status)) return fail(400, 'status must be active or inactive');
    if (role === 'admin' && id === req.session.user.id && status === 'inactive') {
      return fail(409, 'You cannot deactivate your own account');
    }
    if (email !== cur.email && await emailInUse(db, email, { role, id })) {
      return fail(409, 'Email already registered');
    }
    const assignment = role === 'staff' ? await readAssignment(db, b) : { serviceId: null };
    if (assignment.error) return fail(400, assignment.error);

    await db.query(
      `UPDATE ${table} SET full_name = $1, email = $2, contact_number = $3, status = $4 WHERE ${idCol} = $5`,
      [full_name, email, contact, status, id]
    );
    if (assignment.serviceId) await assignStaff(db, id, assignment.serviceId, assignment.label);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/admin/users/:role/:id/reset-password  - new temporary password, must change at login
router.post('/users/:role/:id/reset-password', async (req, res, next) => {
  try {
    const role = roleFromParams(req, res);
    if (!role) return;
    const id = toId(req.params.id);
    const { table, idCol } = ROLES[role];
    const password = randomPassword();
    const result = id && await pool.query(
      `UPDATE ${table} SET password_hash = $1, must_change_password = TRUE WHERE ${idCol} = $2`,
      [await bcrypt.hash(password, 10), id]
    );
    if (!result || !result.rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, temporary_password: password });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* Queue records                                                       */
/* ------------------------------------------------------------------ */

// Reads and checks the filters of the queue records screen. Returns { error } or { filters }.
async function recordFilters(req) {
  const settings = await getSettings(pool);
  const today = clinicNow(settings.time_zone).date;
  const { status, q, service_id, date } = req.query;
  const from = req.query.from || date || today;
  const to = req.query.to || date || from;

  if (!isDate(from) || !isDate(to)) return { error: 'Dates must look like YYYY-MM-DD' };
  if (from > to) return { error: 'from must not be after to' };
  if (status && !TICKET_STATUSES.includes(status)) return { error: 'Invalid status' };
  const serviceId = service_id ? toId(service_id) : null;
  if (service_id && !serviceId) return { error: 'Invalid service_id' };

  // deleted = exclude (default) | only | include   (deleted=1 also means "only")
  let deleted = req.query.deleted || 'exclude';
  if (deleted === '1') deleted = 'only';
  if (!['exclude', 'only', 'include'].includes(deleted)) return { error: 'deleted must be exclude, only or include' };

  return {
    filters: {
      from, to, status, q: String(q || '').trim(),
      serviceIds: serviceId ? [serviceId] : null, deleted,
    },
  };
}

// GET /api/admin/tickets?from&to&status&q&service_id&deleted=exclude|only|include&page&page_size
// (a single ?date=YYYY-MM-DD also works; with no dates it shows today)
router.get('/tickets', async (req, res, next) => {
  try {
    const { error, filters } = await recordFilters(req);
    if (error) return res.status(400).json({ error });
    const paging = parsePage(req.query, 20);
    const result = await searchTickets(pool, { ...filters, limit: paging.pageSize, offset: paging.offset });
    res.json({ from: filters.from, to: filters.to, tickets: result.tickets, ...pagination(result.total, paging) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/tickets/export  - the same search as a CSV file (up to 5000 rows)
router.get('/tickets/export', async (req, res, next) => {
  try {
    const { error, filters } = await recordFilters(req);
    if (error) return res.status(400).json({ error });
    const result = await searchTickets(pool, { ...filters, limit: 5000, offset: 0 });
    sendCsv(res, `clinicflow-tickets-${filters.from}-to-${filters.to}.csv`, toCsv([
      { label: 'Date', get: t => t.queue_date },
      { label: 'Ticket', get: t => t.ticket_label },
      { label: 'Service', get: t => t.service_name },
      { label: 'Patient', get: t => t.display_name },
      { label: 'Status', get: t => t.status },
      { label: 'Joined', get: t => t.queued_at },
      { label: 'Called', get: t => t.called_at },
      { label: 'Completed', get: t => t.completed_at },
      { label: 'Wait (minutes)', get: t => t.wait_minutes },
      { label: 'Service (minutes)', get: t => t.service_minutes },
      { label: 'Staff', get: t => t.staff_name },
      { label: 'Reason', get: t => t.status_reason },
      { label: 'Deleted', get: t => (t.is_deleted ? 'yes' : 'no') },
    ], result.tickets));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/tickets/:id  - one ticket with its history
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await ticketDetails(pool, req.params.id, null);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

async function addAdminHistory(db, action, reason, ticketId, adminId) {
  await db.query(
    'INSERT INTO ticket_history (action, reason, ticket_id, admin_id) VALUES ($1, $2, $3, $4)',
    [action, reason || null, ticketId, adminId]
  );
}

async function lockTicket(db, id) {
  const ticketId = toId(id);
  if (!ticketId) return undefined;
  const { rows } = await db.query(
    `SELECT t.*, s.prefix FROM tickets t JOIN services s ON s.service_id = t.service_id
      WHERE t.ticket_id = $1 FOR UPDATE OF t`,
    [ticketId]
  );
  return rows[0];
}

// PATCH /api/admin/tickets/:id  body: { status?, note?, priority?, walk_in_name?, reason? }
router.patch('/tickets/:id', (req, res, next) => {
  const adminId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await lockTicket(db, req.params.id);
    if (!t) return fail(404, 'Ticket not found');
    const b = bodyOf(req);

    const status = b.status !== undefined ? b.status : t.status;
    if (!TICKET_STATUSES.includes(status)) return fail(400, 'Invalid status');
    const name = t.walk_in_name && b.walk_in_name !== undefined
      ? String(b.walk_in_name).trim().slice(0, 100) : t.walk_in_name;
    if (t.walk_in_name && !name) return fail(400, 'walk_in_name cannot be empty');
    const priority = b.priority !== undefined ? !!b.priority : t.priority;
    const note = b.note !== undefined ? String(b.note || '').trim().slice(0, 100) || null : t.note;
    const reason = String(b.reason || '').trim().slice(0, 100) || null;

    await db.query(
      `UPDATE tickets SET status = $1, note = $2, priority = $3, walk_in_name = $4,
              status_reason = COALESCE($5, status_reason),
              called_at = CASE WHEN $1::ticket_status IN ('serving', 'completed')
                               THEN COALESCE(called_at, NOW()) ELSE called_at END,
              completed_at = CASE WHEN $1::ticket_status = 'completed'
                                  THEN COALESCE(completed_at, NOW()) ELSE completed_at END
        WHERE ticket_id = $6`,
      [status, note, priority, name, reason, t.ticket_id]
    );

    const changed = status !== t.status;
    const action = changed && ['completed', 'skipped', 'cancelled'].includes(status) ? status : 'edited';
    await addAdminHistory(db, action, reason, t.ticket_id, adminId);
    if (changed && ['skipped', 'cancelled'].includes(status)) {
      await notifyPatient(db, t, status, `${ticketLabel(t)} - your ticket was ${status} by the clinic.`);
    }
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

// DELETE /api/admin/tickets/:id  body: { reason }  - soft delete (can be restored)
router.delete('/tickets/:id', (req, res, next) => {
  const adminId = req.session.user.id;
  const reason = String(bodyOf(req).reason || '').trim().slice(0, 100);
  if (!reason) return res.status(400).json({ error: 'A reason is required to delete a ticket' });

  inTransaction(res, next, async db => {
    const t = await lockTicket(db, req.params.id);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');
    await db.query('UPDATE tickets SET is_deleted = TRUE WHERE ticket_id = $1', [t.ticket_id]);
    await addAdminHistory(db, 'deleted', reason, t.ticket_id, adminId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/admin/tickets/:id/restore
router.post('/tickets/:id/restore', (req, res, next) => {
  const adminId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await lockTicket(db, req.params.id);
    if (!t || !t.is_deleted) return fail(404, 'Deleted ticket not found');
    await db.query('UPDATE tickets SET is_deleted = FALSE WHERE ticket_id = $1', [t.ticket_id]);
    await addAdminHistory(db, 'restored', null, t.ticket_id, adminId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

/* ------------------------------------------------------------------ */
/* Clinic settings                                                     */
/* ------------------------------------------------------------------ */

// GET /api/admin/settings
router.get('/settings', async (req, res, next) => {
  try {
    res.json({ settings: await getSettings(pool) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/settings  body: any of clinic_name, time_zone, near_threshold,
//                                  grace_minutes, default_travel_minutes
router.patch('/settings', async (req, res, next) => {
  try {
    const cur = await getSettings(pool);
    const b = bodyOf(req);
    const clinic_name = b.clinic_name !== undefined ? String(b.clinic_name).trim().slice(0, 100) : cur.clinic_name;
    const time_zone = b.time_zone !== undefined ? String(b.time_zone).trim() : cur.time_zone;
    const near = b.near_threshold !== undefined ? Number(b.near_threshold) : cur.near_threshold;
    const grace = b.grace_minutes !== undefined ? Number(b.grace_minutes) : cur.grace_minutes;
    const travel = b.default_travel_minutes !== undefined ? Number(b.default_travel_minutes) : cur.default_travel_minutes;

    if (!clinic_name) return res.status(400).json({ error: 'clinic_name cannot be empty' });
    try {
      new Intl.DateTimeFormat('en', { timeZone: time_zone });
    } catch {
      return res.status(400).json({ error: 'time_zone is not a valid time zone, e.g. Asia/Manila' });
    }
    if (!Number.isInteger(near) || near < 1) return res.status(400).json({ error: 'near_threshold must be 1 or more' });
    if (!Number.isInteger(grace) || grace < 0) return res.status(400).json({ error: 'grace_minutes must be 0 or more' });
    if (!Number.isInteger(travel) || travel < 0) return res.status(400).json({ error: 'default_travel_minutes must be 0 or more' });

    await pool.query(
      `UPDATE clinic_settings SET clinic_name = $1, time_zone = $2, near_threshold = $3,
              grace_minutes = $4, default_travel_minutes = $5 WHERE setting_id = $6`,
      [clinic_name, time_zone, near, grace, travel, cur.setting_id]
    );
    res.json({ settings: await getSettings(pool) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
