// Background task: expires tickets that can no longer be served.
// server.js runs expireTickets() once a minute.
const pool = require('./db');
const { clinicNow, getSettings, ticketLabel } = require('./helpers');
const { checkNearAlerts } = require('./notifications');

// Writes the history entry and the patient notification for each expired ticket.
async function recordExpired(db, rows, reason, text) {
  for (const t of rows) {
    await db.query(
      "INSERT INTO ticket_history (action, reason, ticket_id) VALUES ('expired', $1, $2)",
      [reason, t.ticket_id]
    );
    if (t.patient_id) {
      await db.query(
        "INSERT INTO notifications (type, message, patient_id, ticket_id) VALUES ('skipped', $1, $2, $3)",
        [`${ticketLabel(t)} - ${text}`, t.patient_id, t.ticket_id]
      );
    }
  }
}

// Returns how many tickets were expired.
async function expireTickets() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settings = await getSettings(client);
    const { date, time } = clinicNow(settings.time_zone);

    // 1. Called, but the patient never arrived within the grace period.
    const noShowReason = 'No show after being called';
    const { rows: noShows } = await client.query(
      `UPDATE tickets t SET status = 'skipped', status_reason = $1
         FROM services s
        WHERE s.service_id = t.service_id AND t.is_deleted = FALSE
          AND t.status = 'serving' AND t.arrived_at IS NULL
          AND t.called_at < NOW() - ($2::int * INTERVAL '1 minute')
        RETURNING t.ticket_id, t.patient_id, t.queue_number, t.service_id, s.prefix`,
      [noShowReason, settings.grace_minutes]
    );
    await recordExpired(client, noShows, noShowReason,
      'you did not arrive in time, so your ticket expired.');

    // 2. Still waiting after the service closed, or left over from an earlier day.
    const closedReason = 'Queue closed';
    const { rows: closed } = await client.query(
      `UPDATE tickets t SET status = 'skipped', status_reason = $1
         FROM services s
        WHERE s.service_id = t.service_id AND t.is_deleted = FALSE
          AND ((t.queue_date < $2::date AND t.status IN ('waiting', 'serving'))
            OR (t.queue_date = $2::date AND t.status = 'waiting' AND s.close_time <= $3::time))
        RETURNING t.ticket_id, t.patient_id, t.queue_number, t.service_id, s.prefix`,
      [closedReason, date, time]
    );
    await recordExpired(client, closed, closedReason,
      'the queue closed before your turn, so your ticket expired.');

    // The line moved, so people further back may now be "near".
    const serviceIds = new Set([...noShows, ...closed].map(t => t.service_id));
    for (const id of serviceIds) await checkNearAlerts(client, id);

    await client.query('COMMIT');
    return noShows.length + closed.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { expireTickets };
