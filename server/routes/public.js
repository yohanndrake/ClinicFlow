// routes/public.js - the active services, their queue state and who is being served, no login needed

//imports: the router tool, the database pool and the shared helpers.
const express = require("express");
const pool = require("../db");
const {
  clinicNow,
  getSettings,
  ticketLabel,
  unavailableReason,
} = require("../helpers");

//includes router
const router = express.Router();

//board data for the waiting room screen: services, queue state, who is serving and who is next
router.get("/board", async (req, res, next) => {
  try {
    //loads the clinic settings and the clinic's current date and time
    const settings = await getSettings(pool);
    const { date, time } = clinicNow(settings.time_zone);

    //query 1: load every active service, sorted by name
    const { rows: services } = await pool.query(
      "SELECT * FROM services WHERE is_active = TRUE ORDER BY service_name",
    );

    //query 2: today's waiting and serving tickets, in queue order, with each one's room
    const { rows: tickets } = await pool.query(
      `SELECT t.service_id, t.queue_number, t.status, s.prefix, ss.counter_label AS room
         FROM tickets t
         JOIN services s ON s.service_id = t.service_id
         LEFT JOIN staff_services ss ON ss.staff_id = t.staff_id AND ss.service_id = t.service_id
        WHERE t.queue_date = $1 AND t.status IN ('waiting', 'serving') AND t.is_deleted = FALSE
        ORDER BY t.priority DESC, t.queue_number ASC`,
      [date],
    );

    //query 3: load every room name, grouped by service later
    const { rows: rooms } = await pool.query(
      "SELECT service_id, counter_label FROM staff_services ORDER BY staff_service_id",
    );

    //send the board: clinic info, then each service with its state, rooms, serving and next-up tickets
    res.json({
      clinic_name: settings.clinic_name,
      time_zone: settings.time_zone,
      server_time: new Date().toISOString(),
      //for each service, pick out its own tickets from the lists loaded above (no more database calls)
      services: services.map((s) => {
        //only the tickets that belong to this service
        const mine = tickets.filter((t) => t.service_id === s.service_id);

        //why people cannot take a number right now (paused, closed, outside hours), or null if they can
        const reason = unavailableReason(s, time);

        //the queue state shown on the board: open, paused or closed.
        const state = s.queue_status === "open" ? "open" : s.queue_status;

        //numbers are only shown while the queue is open; paused or closed boards show just the state.
        const showQueue = s.queue_status === "open";

        //tickets that are still waiting (not yet called).
        const waiting = mine.filter((t) => t.status === "waiting");

        //the service details for the board, including whether people can still take a number
        return {
          service_id: s.service_id,
          service_name: s.service_name,
          prefix: s.prefix,
          state,
          status_note: s.status_note,
          open_time: s.open_time,
          close_time: s.close_time,
          rooms: rooms
            .filter((r) => r.service_id === s.service_id)
            .map((r) => r.counter_label),
          taking_tickets: reason === null,
          unavailable_reason: reason,

          //who is being served now, the next five waiting tickets, and how many are waiting
          serving: showQueue
            ? mine
                .filter((t) => t.status === "serving")
                .map((t) => ({ ticket_label: ticketLabel(t), room: t.room }))
            : [],
          next_up: showQueue ? waiting.slice(0, 5).map(ticketLabel) : [],
          waiting_count: showQueue ? waiting.length : null,
        };
      }),
    });

    //any unexpected error goes to the error handler in server.js.
  } catch (err) {
    next(err);
  }
});

//share the router with server.js
module.exports = router;
