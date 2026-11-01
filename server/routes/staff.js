const express = require('express');
const pool = require('../db');
const { requireRole, blockIfMustChangePassword } = require('../middleware/auth');
const {
  clinicNow, getSettings, ticketLabel, inTransaction, fail, toId, isDate, daysBefore, parsePage, pagination,
} = require('../helpers');
const { checkNearAlerts, notifyPatient, notifyPaused } = require('../notifications');
const { searchTickets, ticketDetails } = require('../records');

const router = express.Router();
router.use(requireRole('staff'), blockIfMustChangePassword);

const STATUSES = ['waiting', 'serving', 'completed', 'skipped', 'cancelled'];
const bodyOf = req => req.body || {};

// Services this staff member is assigned to, with their counter label.
async function assignedServices(db, staffId) {
  const { rows } = await db.query(
    `SELECT s.service_id, s.service_name, s.prefix, s.queue_status, s.status_note,
            s.open_time, s.close_time, ss.counter_label
       FROM staff_services ss JOIN services s ON s.service_id = ss.service_id
      WHERE ss.staff_id = $1 AND s.is_active = TRUE ORDER BY s.service_name`,
    [staffId]
  );
  return rows;
}

// Loads (and locks) a ticket, only if it belongs to a service this staff member handles.
async function loadTicket(db, ticketId, staffId) {
  const id = toId(ticketId);
  if (!id) return undefined;
  const { rows } = await db.query(
    `SELECT t.*, s.prefix, ss.counter_label
       FROM tickets t
       JOIN services s ON s.service_id = t.service_id
       JOIN staff_services ss ON ss.service_id = t.service_id AND ss.staff_id = $1
      WHERE t.ticket_id = $2 FOR UPDATE OF t`,
    [staffId, id]
  );
  return rows[0];
}

async function addHistory(db, action, reason, ticketId, staffId) {
  await db.query(
    'INSERT INTO ticket_history (action, reason, ticket_id, staff_id) VALUES ($1, $2, $3, $4)',
    [action, reason || null, ticketId, staffId]
  );
}

// GET /api/staff/services
router.get('/services', async (req, res, next) => {
  try {
    res.json({ services: await assignedServices(pool, req.session.user.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/queue?service_id=1[&deleted=1][&status=waiting][&q=text]  - today's tickets for one service
router.get('/queue', async (req, res, next) => {
  try {
    const staffId = req.session.user.id;
    const services = await assignedServices(pool, staffId);
    const serviceId = toId(req.query.service_id) || (services[0] && services[0].service_id);
    if (!services.some(s => s.service_id === serviceId)) {
      return res.status(403).json({ error: 'You are not assigned to this service' });
    }
    if (req.query.status && !STATUSES.includes(req.query.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const showDeleted = req.query.deleted === '1';
    const settings = await getSettings(pool);
    const { date } = clinicNow(settings.time_zone);

    const { rows } = await pool.query(
      `SELECT t.*, s.prefix, p.full_name AS patient_name, p.contact_number,
              ROUND(EXTRACT(EPOCH FROM (NOW() - t.queued_at)) / 60)::int AS waiting_minutes,
              ROUND(EXTRACT(EPOCH FROM (NOW() - t.called_at)) / 60)::int AS called_minutes_ago
         FROM tickets t
         JOIN services s ON s.service_id = t.service_id
         LEFT JOIN patients p ON p.patient_id = t.patient_id
        WHERE t.service_id = $1 AND t.queue_date = $2 AND t.is_deleted = $3
        ORDER BY (t.status = 'serving') DESC, (t.status = 'waiting') DESC,
                 t.priority DESC, t.queue_number ASC`,
      [serviceId, date, showDeleted]
    );

    // Number the waiting tickets 1, 2, 3... in the order they will be called.
    let position = 0;
    let all = rows.map(t => ({
      ...t,
      ticket_label: ticketLabel(t),
      display_name: t.patient_name || t.walk_in_name,
      position: t.status === 'waiting' ? ++position : null,
      arrived: !!t.arrived_at,
    }));

    const counts = { waiting: 0, serving: 0, completed: 0, skipped: 0, cancelled: 0 };
    if (!showDeleted) for (const t of all) counts[t.status]++;

    // The ticket this staff member is serving right now, and who is next.
    const current = all.find(t => t.status === 'serving' && t.staff_id === staffId) || null;
    if (current && current.called_at) {
      current.arrive_by = new Date(new Date(current.called_at).getTime() + settings.grace_minutes * 60000).toISOString();
    }
    const nextUp = all.find(t => t.status === 'waiting') || null;

    // Optional filters for the table.
    if (req.query.status) all = all.filter(t => t.status === req.query.status);
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) {
      all = all.filter(t => `${t.display_name || ''} ${t.ticket_label}`.toLowerCase().includes(q));
    }

    res.json({
      service: services.find(s => s.service_id === serviceId),
      grace_minutes: settings.grace_minutes,
      counts,
      current,
      next_up: nextUp,
      tickets: all,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/records?from&to&status&q&service_id&page&page_size  - past tickets of my services
router.get('/records', async (req, res, next) => {
  try {
    const services = await assignedServices(pool, req.session.user.id);
    const settings = await getSettings(pool);
    const { date: today } = clinicNow(settings.time_zone);
    const { from, to, status, q, service_id } = req.query;
    if ((from && !isDate(from)) || (to && !isDate(to))) {
      return res.status(400).json({ error: 'Dates must look like YYYY-MM-DD' });
    }
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    let serviceIds = services.map(s => s.service_id);
    if (service_id) {
      const wanted = toId(service_id);
      if (!serviceIds.includes(wanted)) return res.status(403).json({ error: 'You are not assigned to this service' });
      serviceIds = [wanted];
    }
    const paging = parsePage(req.query, 20);
    const result = await searchTickets(pool, {
      from: from || daysBefore(today, 6), to: to || today, status, q: String(q || '').trim(),
      serviceIds, deleted: 'exclude', limit: paging.pageSize, offset: paging.offset,
    });
    res.json({ tickets: result.tickets, ...pagination(result.total, paging) });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/tickets/:id  - one ticket with its history
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const services = await assignedServices(pool, req.session.user.id);
    const ticket = await ticketDetails(pool, req.params.id, services.map(s => s.service_id));
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/call-next  body: { service_id }
router.post('/call-next', (req, res, next) => {
  const staffId = req.session.user.id;
  const serviceId = toId(bodyOf(req).service_id);
  if (!serviceId) return res.status(400).json({ error: 'service_id is required' });

  inTransaction(res, next, async db => {
    // Lock the service so two counters can't call the same ticket.
    const { rows: svc } = await db.query(
      `SELECT s.*, ss.counter_label FROM services s
         JOIN staff_services ss ON ss.service_id = s.service_id AND ss.staff_id = $1
        WHERE s.service_id = $2 AND s.is_active = TRUE FOR UPDATE OF s`,
      [staffId, serviceId]
    );
    const service = svc[0];
    if (!service) return fail(403, 'You are not assigned to this service');
    if (service.queue_status === 'paused') return fail(409, 'Queue is paused');

    const settings = await getSettings(db);
    const { date } = clinicNow(settings.time_zone);

    const { rows: current } = await db.query(
      `SELECT ticket_id FROM tickets
        WHERE staff_id = $1 AND queue_date = $2 AND status = 'serving' AND is_deleted = FALSE`,
      [staffId, date]
    );
    if (current.length) return fail(409, 'Finish or skip your current patient first');

    const { rows: waiting } = await db.query(
      `SELECT * FROM tickets
        WHERE service_id = $1 AND queue_date = $2 AND status = 'waiting' AND is_deleted = FALSE
        ORDER BY priority DESC, queue_number ASC LIMIT 1 FOR UPDATE`,
      [serviceId, date]
    );
    const ticket = waiting[0];
    if (!ticket) return fail(404, 'No one is waiting');

    await db.query(
      "UPDATE tickets SET status = 'serving', called_at = NOW(), arrived_at = NULL, staff_id = $1 WHERE ticket_id = $2",
      [staffId, ticket.ticket_id]
    );
    await addHistory(db, 'called', null, ticket.ticket_id, staffId);
    const label = ticketLabel({ ...ticket, prefix: service.prefix });
    await notifyPatient(db, ticket, 'called',
      `${label} - it's your turn! Please go to ${service.counter_label}.`);
    await checkNearAlerts(db, serviceId);
    return { status: 200, body: { ok: true, ticket_id: ticket.ticket_id, ticket_label: label } };
  });
});

// Shared by complete / skip / cancel.
function statusChange({ allowedFrom, newStatus, action, extraSql = '', notify }) {
  return (req, res, next) => {
    const staffId = req.session.user.id;
    const reason = String(bodyOf(req).reason || '').trim().slice(0, 100) || null;
    inTransaction(res, next, async db => {
      const t = await loadTicket(db, req.params.id, staffId);
      if (!t || t.is_deleted) return fail(404, 'Ticket not found');
      if (!allowedFrom.includes(t.status)) {
        return fail(409, `A ${t.status} ticket cannot be changed this way`);
      }
      await db.query(
        `UPDATE tickets SET status = $1, status_reason = COALESCE($2, status_reason),
                staff_id = $3 ${extraSql} WHERE ticket_id = $4`,
        [newStatus, reason, staffId, t.ticket_id]
      );
      await addHistory(db, action, reason, t.ticket_id, staffId);
      if (notify) {
        await notifyPatient(db, t, notify.type, `${ticketLabel(t)} - ${notify.text}`);
      }
      await checkNearAlerts(db, t.service_id);
      return { status: 200, body: { ok: true } };
    });
  };
}

router.post('/tickets/:id/complete', statusChange({
  allowedFrom: ['serving'], newStatus: 'completed', action: 'completed',
  extraSql: ', completed_at = NOW()',
}));

router.post('/tickets/:id/skip', statusChange({
  allowedFrom: ['waiting', 'serving'], newStatus: 'skipped', action: 'skipped',
  notify: { type: 'skipped', text: 'you were skipped. Please see the staff if this is a mistake.' },
}));

router.post('/tickets/:id/cancel', statusChange({
  allowedFrom: ['waiting', 'serving'], newStatus: 'cancelled', action: 'cancelled',
  notify: { type: 'cancelled', text: 'your ticket was cancelled by the clinic.' },
}));

// POST /api/staff/tickets/:id/arrived  - patient showed up at the counter
router.post('/tickets/:id/arrived', (req, res, next) => {
  const staffId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');
    if (t.status !== 'serving') return fail(409, 'Only the patient being served can be marked arrived');
    await db.query('UPDATE tickets SET arrived_at = NOW() WHERE ticket_id = $1', [t.ticket_id]);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/staff/tickets/:id/reannounce  - call the patient again (restarts the arrival timer)
router.post('/tickets/:id/reannounce', (req, res, next) => {
  const staffId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');
    if (t.status !== 'serving') return fail(409, 'Only the patient being served can be called again');
    await db.query('UPDATE tickets SET called_at = NOW() WHERE ticket_id = $1', [t.ticket_id]);
    await addHistory(db, 'called', 'Re-announced', t.ticket_id, staffId);
    await notifyPatient(db, t, 'called',
      `${ticketLabel(t)} - you are being called again. Please go to ${t.counter_label}.`);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/staff/tickets/:id/recall  - put a skipped ticket back in the queue
router.post('/tickets/:id/recall', (req, res, next) => {
  const staffId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');
    if (t.status !== 'skipped') return fail(409, 'Only skipped tickets can be recalled');

    const settings = await getSettings(db);
    const { date } = clinicNow(settings.time_zone);
    if (t.queue_date !== date) return fail(409, 'Only tickets from today can be recalled');

    if (t.patient_id) {
      const { rows: active } = await db.query(
        `SELECT ticket_id FROM tickets
          WHERE patient_id = $1 AND queue_date = $2 AND status IN ('waiting','serving') AND is_deleted = FALSE`,
        [t.patient_id, date]
      );
      if (active.length) return fail(409, 'This patient already has another active ticket');
    }

    await db.query(
      `UPDATE tickets SET status = 'waiting', status_reason = NULL, called_at = NULL, arrived_at = NULL
        WHERE ticket_id = $1`,
      [t.ticket_id]
    );
    await addHistory(db, 'restored', 'Recalled', t.ticket_id, staffId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/staff/service-status  body: { service_id, queue_status: open|paused|closed, status_note? }
// Pausing warns everyone waiting. Closing cancels everyone still waiting today.
router.post('/service-status', (req, res, next) => {
  const staffId = req.session.user.id;
  const b = bodyOf(req);
  const serviceId = toId(b.service_id);
  if (!serviceId) return res.status(400).json({ error: 'service_id is required' });
  if (!['open', 'paused', 'closed'].includes(b.queue_status)) {
    return res.status(400).json({ error: 'queue_status must be open, paused or closed' });
  }
  const note = String(b.status_note || '').trim().slice(0, 100) || null;

  inTransaction(res, next, async db => {
    const { rows: svc } = await db.query(
      `SELECT s.* FROM services s
         JOIN staff_services ss ON ss.service_id = s.service_id AND ss.staff_id = $1
        WHERE s.service_id = $2 AND s.is_active = TRUE FOR UPDATE OF s`,
      [staffId, serviceId]
    );
    const service = svc[0];
    if (!service) return fail(403, 'You are not assigned to this service');

    const settings = await getSettings(db);
    const { date } = clinicNow(settings.time_zone);

    await db.query(
      'UPDATE services SET queue_status = $1, status_note = $2 WHERE service_id = $3',
      [b.queue_status, b.queue_status === 'open' ? null : note, serviceId]
    );

    let cancelled = 0;
    if (b.queue_status === 'paused' && service.queue_status !== 'paused') {
      await notifyPaused(db, { ...service, status_note: note }, date);
    }
    if (b.queue_status === 'closed') {
      const reason = 'Closed for the day';
      const { rows } = await db.query(
        `UPDATE tickets SET status = 'cancelled', status_reason = $1
          WHERE service_id = $2 AND queue_date = $3 AND status = 'waiting' AND is_deleted = FALSE
          RETURNING ticket_id, patient_id, queue_number`,
        [reason, serviceId, date]
      );
      for (const t of rows) {
        await addHistory(db, 'cancelled', reason, t.ticket_id, staffId);
        await notifyPatient(db, t, 'cancelled',
          `${ticketLabel({ ...t, prefix: service.prefix })} - the queue was closed for the day.`);
      }
      cancelled = rows.length;
    }
    return { status: 200, body: { ok: true, queue_status: b.queue_status, cancelled } };
  });
});

// POST /api/staff/walk-ins  body: { service_id, walk_in_name, priority?, note? }
router.post('/walk-ins', (req, res, next) => {
  const staffId = req.session.user.id;
  const b = bodyOf(req);
  const serviceId = toId(b.service_id);
  const name = String(b.walk_in_name || '').trim();
  if (!serviceId) return res.status(400).json({ error: 'service_id is required' });
  if (!name) return res.status(400).json({ error: 'walk_in_name is required' });

  inTransaction(res, next, async db => {
    const { rows: svc } = await db.query(
      `SELECT s.* FROM services s
         JOIN staff_services ss ON ss.service_id = s.service_id AND ss.staff_id = $1
        WHERE s.service_id = $2 AND s.is_active = TRUE FOR UPDATE OF s`,
      [staffId, serviceId]
    );
    const service = svc[0];
    if (!service) return fail(403, 'You are not assigned to this service');
    if (service.queue_status === 'closed') return fail(409, 'Queue is closed');

    const settings = await getSettings(db);
    const { date } = clinicNow(settings.time_zone);
    const { rows: stats } = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(MAX(queue_number), 0) AS last_number
         FROM tickets WHERE service_id = $1 AND queue_date = $2`,
      [serviceId, date]
    );
    if (service.daily_limit !== null && stats[0].total >= service.daily_limit) {
      return fail(409, 'Daily limit reached for this service');
    }
    const number = Number(stats[0].last_number) + 1;
    const { rows: created } = await db.query(
      `INSERT INTO tickets (queue_date, queue_number, walk_in_name, priority, note, service_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ticket_id`,
      [date, number, name.slice(0, 100), !!b.priority,
       String(b.note || '').trim().slice(0, 100) || null, serviceId]
    );
    await addHistory(db, 'created', 'Walk-in', created[0].ticket_id, staffId);
    await checkNearAlerts(db, serviceId);
    return {
      status: 201,
      body: {
        ticket_id: created[0].ticket_id,
        ticket_label: ticketLabel({ prefix: service.prefix, queue_number: number }),
      },
    };
  });
});

// PATCH /api/staff/tickets/:id  body: { walk_in_name?, priority?, note? }
router.patch('/tickets/:id', (req, res, next) => {
  const staffId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');

    const b = bodyOf(req);
    // Only walk-in names can be edited; patient names come from their account.
    const name = t.walk_in_name && b.walk_in_name !== undefined
      ? String(b.walk_in_name).trim().slice(0, 100) : t.walk_in_name;
    if (t.walk_in_name && !name) return fail(400, 'walk_in_name cannot be empty');
    const priority = b.priority !== undefined ? !!b.priority : t.priority;
    const note = b.note !== undefined ? String(b.note || '').trim().slice(0, 100) || null : t.note;

    await db.query(
      'UPDATE tickets SET walk_in_name = $1, priority = $2, note = $3 WHERE ticket_id = $4',
      [name, priority, note, t.ticket_id]
    );
    await addHistory(db, 'edited', null, t.ticket_id, staffId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

// DELETE /api/staff/tickets/:id  body: { reason }  - soft delete (can be restored)
router.delete('/tickets/:id', (req, res, next) => {
  const staffId = req.session.user.id;
  const reason = String(bodyOf(req).reason || '').trim().slice(0, 100);
  if (!reason) return res.status(400).json({ error: 'A reason is required to delete a ticket' });

  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || t.is_deleted) return fail(404, 'Ticket not found');
    await db.query('UPDATE tickets SET is_deleted = TRUE WHERE ticket_id = $1', [t.ticket_id]);
    await addHistory(db, 'deleted', reason, t.ticket_id, staffId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

// POST /api/staff/tickets/:id/restore
router.post('/tickets/:id/restore', (req, res, next) => {
  const staffId = req.session.user.id;
  inTransaction(res, next, async db => {
    const t = await loadTicket(db, req.params.id, staffId);
    if (!t || !t.is_deleted) return fail(404, 'Deleted ticket not found');
    await db.query('UPDATE tickets SET is_deleted = FALSE WHERE ticket_id = $1', [t.ticket_id]);
    await addHistory(db, 'restored', null, t.ticket_id, staffId);
    await checkNearAlerts(db, t.service_id);
    return { status: 200, body: { ok: true } };
  });
});

module.exports = router;
