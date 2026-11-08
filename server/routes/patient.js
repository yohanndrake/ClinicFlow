// routes/patient.js - services, take a number, my ticket, history, arrive, cancel and notifications

//imports: Express, the database, the guards, the helpers and the near-alert function
const express = require("express");
const pool = require("../db");
const {
  requireRole,
  blockIfMustChangePassword,
} = require("../middleware/auth");
const {
  clinicNow,
  getSettings,
  ticketLabel,
  unavailableReason,
  WAIT_MINUTES,
  SERVICE_MINUTES,
  inTransaction,
  fail,
  toId,
  isDate,
  parsePage,
  pagination,
} = require("../helpers");
const { checkNearAlerts } = require("../notifications");

const router = express.Router();

//every route in this file requires a logged-in PATIENT who is not stuck on a forced password change
router.use(requireRole("patient"), blockIfMustChangePassword);

//the standard ticket query: ticket, service, room, wait and service minutes, and expired flag
const TICKET_SELECT = `
  SELECT t.*, s.service_name, s.prefix, s.avg_service_minutes, ss.counter_label AS room,
         ${WAIT_MINUTES} AS wait_minutes, ${SERVICE_MINUTES} AS service_minutes,
         EXISTS (SELECT 1 FROM ticket_history h WHERE h.ticket_id = t.ticket_id AND h.action = 'expired') AS expired
    FROM tickets t
    JOIN services s ON s.service_id = t.service_id
    LEFT JOIN staff_services ss ON ss.staff_id = t.staff_id AND ss.service_id = t.service_id`;

//turn a ticket into what the patient page shows: position, wait, state, arrive-by time and queue summary
async function describeTicket(db, t, settings) {
  //count waiting tickets ahead of this one, by priority then queue number
  let ahead = 0;
  if (t.status === "waiting") {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS n FROM tickets
        WHERE service_id = $1 AND queue_date = $2 AND status = 'waiting' AND is_deleted = FALSE
          AND (priority > $3 OR (priority = $3 AND queue_number < $4))`,
      [t.service_id, t.queue_date, t.priority, t.queue_number],
    );
    ahead = rows[0].n;
  }

  //the state patients see: near, called or expired, otherwise the ticket's own status
  let state = t.status;
  if (t.status === "waiting" && ahead < settings.near_threshold) state = "near";
  if (t.status === "serving") state = "called";
  if (t.expired) state = "expired";

  //load the service, the ticket being served now, and the waiting count for the queue summary
  const { rows: svc } = await db.query(
    "SELECT * FROM services WHERE service_id = $1",
    [t.service_id],
  );
  const { rows: serving } = await db.query(
    `SELECT queue_number FROM tickets
      WHERE service_id = $1 AND queue_date = $2 AND status = 'serving' AND is_deleted = FALSE
      ORDER BY called_at LIMIT 1`,
    [t.service_id, t.queue_date],
  );
  const { rows: waiting } = await db.query(
    `SELECT COUNT(*) AS n FROM tickets
      WHERE service_id = $1 AND queue_date = $2 AND status = 'waiting' AND is_deleted = FALSE`,
    [t.service_id, t.queue_date],
  );
  const s = svc[0];

  //return the ticket with its position, wait estimate, state, arrive-by time and queue summary
  return {
    ...t,
    ticket_label: ticketLabel(t),
    people_ahead: ahead,
    position: t.status === "waiting" ? ahead + 1 : null,
    estimated_wait_minutes:
      t.status === "waiting" ? ahead * t.avg_service_minutes : 0,
    state,
    grace_minutes: settings.grace_minutes,

    //once called, the patient must arrive before called_at + grace minutes
    arrive_by:
      t.status === "serving" && t.called_at
        ? new Date(
            new Date(t.called_at).getTime() + settings.grace_minutes * 60000,
          ).toISOString()
        : null,

    //a summary of the whole queue: status, note, now serving, waiting count, opening hours
    queue: {
      queue_status: s.queue_status,
      status_note: s.status_note,
      now_serving: serving[0]
        ? ticketLabel({
            prefix: t.prefix,
            queue_number: serving[0].queue_number,
          })
        : null,
      waiting_count: waiting[0].n,
      open_time: s.open_time,
      close_time: s.close_time,
    },
  };
}

//list active services for the patient: waiting counts, now serving, estimated wait and availability
router.get("/services", async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const { date, time } = clinicNow(settings.time_zone);

    //load active services, today's waiting and serving tickets, and rooms in three queries
    const { rows: services } = await pool.query(
      "SELECT * FROM services WHERE is_active = TRUE ORDER BY service_name",
    );
    const { rows: tickets } = await pool.query(
      `SELECT service_id, status, queue_number FROM tickets
        WHERE queue_date = $1 AND status IN ('waiting','serving') AND is_deleted = FALSE
        ORDER BY called_at, queue_number`,
      [date],
    );
    const { rows: rooms } = await pool.query(
      "SELECT service_id, counter_label FROM staff_services ORDER BY staff_service_id",
    );

    //add waiting count, now serving, estimated wait and availability to each service
    res.json({
      default_travel_minutes: settings.default_travel_minutes,
      services: services.map((s) => {
        const mine = tickets.filter((t) => t.service_id === s.service_id);
        const waitingCount = mine.filter((t) => t.status === "waiting").length;
        const serving = mine.find((t) => t.status === "serving");
        const reason = unavailableReason(s, time);
        return {
          ...s,
          rooms: rooms
            .filter((r) => r.service_id === s.service_id)
            .map((r) => r.counter_label),
          waiting_count: waitingCount,
          now_serving: serving
            ? ticketLabel({
                prefix: s.prefix,
                queue_number: serving.queue_number,
              })
            : null,
          estimated_wait_minutes: waitingCount * s.avg_service_minutes,
          available: reason === null,
          unavailable_reason: reason,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

//take a queue number: validate the input, then check the service and create the ticket in one transaction
router.post("/tickets", (req, res, next) => {
  //check the service ID, optional travel time and note before taking a number
  const serviceId = toId(req.body.service_id);
  if (!serviceId)
    return res.status(400).json({ error: "service_id is required" });
  const patientId = req.session.user.id;

  let travel = req.body.travel_minutes;
  if (travel !== undefined && travel !== null && travel !== "") {
    travel = Number(travel);
    if (!Number.isInteger(travel) || travel < 0 || travel > 600) {
      return res.status(400).json({
        error: "Travel time must be a whole number from 0 to 600 minutes",
      });
    }
  } else {
    travel = null;
  }
  const note = req.body.note
    ? String(req.body.note).trim().slice(0, 100)
    : null;

  //lock the service, check it is open and the patient has no active ticket, then create the ticket
  inTransaction(res, next, async (db) => {
    const settings = await getSettings(db);
    const { date, time } = clinicNow(settings.time_zone);

    //lock the service so two patients cannot get the same number, then check it is open
    const { rows: svc } = await db.query(
      "SELECT * FROM services WHERE service_id = $1 AND is_active = TRUE FOR UPDATE",
      [serviceId],
    );
    const service = svc[0];
    if (!service) return fail(404, "Service not found");
    const reason = unavailableReason(service, time);
    if (reason)
      return fail(
        409,
        reason === "Outside opening hours"
          ? "Service is outside its opening hours"
          : reason,
      );

    //refuse if the patient already has a waiting or serving ticket today
    const { rows: active } = await db.query(
      `SELECT ticket_id FROM tickets
        WHERE patient_id = $1 AND queue_date = $2 AND status IN ('waiting','serving')
          AND is_deleted = FALSE`,
      [patientId, date],
    );
    if (active.length) return fail(409, "You already have an active ticket");

    //count today's tickets for this service and find the highest queue number so far
    const { rows: stats } = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(MAX(queue_number), 0) AS last_number
         FROM tickets WHERE service_id = $1 AND queue_date = $2`,
      [serviceId, date],
    );

    //refuse if the service has reached its daily limit
    if (service.daily_limit !== null && stats[0].total >= service.daily_limit) {
      return fail(409, "Daily limit reached for this service");
    }

    //create the ticket with the next number, using the typed travel time or the clinic default
    const { rows: created } = await db.query(
      `INSERT INTO tickets (queue_date, queue_number, note, travel_minutes, patient_id, service_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ticket_id`,
      [
        date,
        Number(stats[0].last_number) + 1,
        note,
        travel ?? settings.default_travel_minutes,
        patientId,
        serviceId,
      ],
    );

    //log the new ticket, refresh near alerts, and return the ticket with status 201
    const ticketId = created[0].ticket_id;
    await db.query(
      "INSERT INTO ticket_history (action, ticket_id, patient_id) VALUES ('created', $1, $2)",
      [ticketId, patientId],
    );
    await checkNearAlerts(db, serviceId);

    const { rows } = await db.query(`${TICKET_SELECT} WHERE t.ticket_id = $1`, [
      ticketId,
    ]);
    return {
      status: 201,
      body: { ticket: await describeTicket(db, rows[0], settings) },
    };
  });
});

//get the patient's active or latest ticket for today, for the my ticket page
router.get("/tickets/current", async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const { date } = clinicNow(settings.time_zone);
    const { rows } = await pool.query(
      `${TICKET_SELECT}
        WHERE t.patient_id = $1 AND t.queue_date = $2 AND t.is_deleted = FALSE
        ORDER BY (t.status IN ('waiting','serving')) DESC, t.queued_at DESC LIMIT 1`,
      [req.session.user.id, date],
    );
    res.json({
      ticket: rows[0] ? await describeTicket(pool, rows[0], settings) : null,
    });
  } catch (err) {
    next(err);
  }
});

//list this patient's past tickets, with optional date, status and service filters, one page at a time
router.get("/tickets/history", async (req, res, next) => {
  try {
    const { from, to, status, service_id } = req.query;
    if ((from && !isDate(from)) || (to && !isDate(to))) {
      return res.status(400).json({ error: "Dates must look like YYYY-MM-DD" });
    }
    if (
      status &&
      !["waiting", "serving", "completed", "skipped", "cancelled"].includes(
        status,
      )
    ) {
      return res.status(400).json({ error: "Invalid status" });
    }

    //build the history filters, leaving out any that are empty, and always limit to this patient
    const paging = parsePage(req.query, 10);
    const params = [
      req.session.user.id,
      from || null,
      to || null,
      status || null,
      service_id ? toId(service_id) : null,
    ];
    const where = `
      WHERE t.patient_id = $1 AND t.is_deleted = FALSE
        AND ($2::date IS NULL OR t.queue_date >= $2::date)
        AND ($3::date IS NULL OR t.queue_date <= $3::date)
        AND ($4::text IS NULL OR t.status::text = $4::text)
        AND ($5::int IS NULL OR t.service_id = $5::int)`;

    //count the matching tickets, then send one page of them, newest first
    const { rows: count } = await pool.query(
      `SELECT COUNT(*) AS n FROM tickets t ${where}`,
      params,
    );
    const { rows } = await pool.query(
      `${TICKET_SELECT} ${where} ORDER BY t.queued_at DESC LIMIT $6 OFFSET $7`,
      [...params, paging.pageSize, paging.offset],
    );
    res.json({
      tickets: rows.map((t) => ({ ...t, ticket_label: ticketLabel(t) })),
      ...pagination(count[0].n, paging),
    });
  } catch (err) {
    next(err);
  }
});

//get one of this patient's tickets by id, or 404 if it isn't theirs
router.get("/tickets/:id", async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Ticket not found" });
    const { rows } = await pool.query(
      `${TICKET_SELECT} WHERE t.ticket_id = $1 AND t.patient_id = $2 AND t.is_deleted = FALSE`,
      [id, req.session.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ticket: { ...rows[0], ticket_label: ticketLabel(rows[0]) } });
  } catch (err) {
    next(err);
  }
});

//the patient presses "I'm here": record arrival once, so the no-show job skips them
router.post("/tickets/:id/arrived", async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Ticket not found" });
    const { rows } = await pool.query(
      "SELECT status, arrived_at FROM tickets WHERE ticket_id = $1 AND patient_id = $2 AND is_deleted = FALSE",
      [id, req.session.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Ticket not found" });
    if (!["waiting", "serving"].includes(rows[0].status)) {
      return res.status(409).json({
        error: `A ${rows[0].status} ticket cannot be marked as arrived`,
      });
    }
    if (!rows[0].arrived_at) {
      await pool.query(
        "UPDATE tickets SET arrived_at = NOW() WHERE ticket_id = $1",
        [id],
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

//the patient cancels their own waiting ticket, logs it, and refreshes near alerts
router.post("/tickets/:id/cancel", (req, res, next) => {
  const ticketId = toId(req.params.id);
  const patientId = req.session.user.id;

  inTransaction(res, next, async (db) => {
    if (!ticketId) return fail(404, "Ticket not found");
    const { rows } = await db.query(
      "SELECT * FROM tickets WHERE ticket_id = $1 AND patient_id = $2 AND is_deleted = FALSE FOR UPDATE",
      [ticketId, patientId],
    );
    if (!rows[0]) return fail(404, "Ticket not found");

    // Mark it cancelled with a reason, write the history line, and refresh near alerts for the people behind.
    if (rows[0].status !== "waiting") {
      return fail(409, `A ${rows[0].status} ticket cannot be cancelled`);
    }
    await db.query(
      "UPDATE tickets SET status = 'cancelled', status_reason = 'Cancelled by patient' WHERE ticket_id = $1",
      [ticketId],
    );
    await db.query(
      "INSERT INTO ticket_history (action, reason, ticket_id, patient_id) VALUES ('cancelled', 'Cancelled by patient', $1, $2)",
      [ticketId, patientId],
    );
    await checkNearAlerts(db, rows[0].service_id);
    return { status: 200, body: { ok: true } };
  });
});

//list the latest notifications, optionally only unread ones, with the unread count
router.get("/notifications", async (req, res, next) => {
  try {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 50),
    );
    const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
    const { rows } = await pool.query(
      `SELECT notification_id, type, message, is_read, created_at, ticket_id
         FROM notifications WHERE patient_id = $1 AND ($2::boolean = FALSE OR is_read = FALSE)
        ORDER BY created_at DESC, notification_id DESC LIMIT $3`,
      [req.session.user.id, onlyUnread, limit],
    );
    const { rows: unread } = await pool.query(
      "SELECT COUNT(*) AS n FROM notifications WHERE patient_id = $1 AND is_read = FALSE",
      [req.session.user.id],
    );
    res.json({ unread_count: unread[0].n, notifications: rows });
  } catch (err) {
    next(err);
  }
});

//mark all of this patient's notifications as read
router.post("/notifications/read-all", async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE patient_id = $1 AND is_read = FALSE",
      [req.session.user.id],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

//mark one notification as read (only if it is theirs)
router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(404).json({ error: "Notification not found" });
    const result = await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND patient_id = $2",
      [id, req.session.user.id],
    );
    if (!result.rowCount)
      return res.status(404).json({ error: "Notification not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

//share the router with server.js
module.exports = router;
