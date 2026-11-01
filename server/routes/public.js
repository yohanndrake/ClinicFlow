// Open routes: no login needed. They only ever expose ticket numbers, never names.
const express = require('express');
const pool = require('../db');
const { clinicNow, getSettings, ticketLabel, unavailableReason } = require('../helpers');

const router = express.Router();

// GET /api/public/board
// Everything the landing page and the "Now Serving" board need, for every active service.
router.get('/board', async (req, res, next) => {
  try {
    const settings = await getSettings(pool);
    const { date, time } = clinicNow(settings.time_zone);

    const { rows: services } = await pool.query(
      'SELECT * FROM services WHERE is_active = TRUE ORDER BY service_name'
    );
    // Tickets still in play today, in the order they will be called. `room` is the counter serving them.
    const { rows: tickets } = await pool.query(
      `SELECT t.service_id, t.queue_number, t.status, s.prefix, ss.counter_label AS room
         FROM tickets t
         JOIN services s ON s.service_id = t.service_id
         LEFT JOIN staff_services ss ON ss.staff_id = t.staff_id AND ss.service_id = t.service_id
        WHERE t.queue_date = $1 AND t.status IN ('waiting', 'serving') AND t.is_deleted = FALSE
        ORDER BY t.priority DESC, t.queue_number ASC`,
      [date]
    );
    const { rows: rooms } = await pool.query(
      'SELECT service_id, counter_label FROM staff_services ORDER BY staff_service_id'
    );

    res.json({
      clinic_name: settings.clinic_name,
      time_zone: settings.time_zone,
      server_time: new Date().toISOString(),
      services: services.map(s => {
        const mine = tickets.filter(t => t.service_id === s.service_id);
        const reason = unavailableReason(s, time);
        // "open" = taking tickets; "paused" and "closed" show no queue numbers on the board.
        const state = s.queue_status === 'open' ? 'open' : s.queue_status;
        const showQueue = s.queue_status === 'open';
        const waiting = mine.filter(t => t.status === 'waiting');
        return {
          service_id: s.service_id,
          service_name: s.service_name,
          prefix: s.prefix,
          state,
          status_note: s.status_note,
          open_time: s.open_time,
          close_time: s.close_time,
          rooms: rooms.filter(r => r.service_id === s.service_id).map(r => r.counter_label),
          taking_tickets: reason === null,
          unavailable_reason: reason,
          serving: showQueue
            ? mine.filter(t => t.status === 'serving').map(t => ({ ticket_label: ticketLabel(t), room: t.room }))
            : [],
          next_up: showQueue ? waiting.slice(0, 5).map(ticketLabel) : [],
          waiting_count: showQueue ? waiting.length : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
