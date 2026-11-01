// Creates "your turn is near" alerts. Call it after anything that changes a queue
// (calling, completing, skipping, cancelling, deleting, restoring, priority changes).
const { clinicNow, getSettings, ticketLabel } = require('./helpers');

async function checkNearAlerts(db, serviceId) {
  const settings = await getSettings(db);
  const { date } = clinicNow(settings.time_zone);

  // Waiting tickets in the order they will be called.
  const { rows: waiting } = await db.query(
    `SELECT t.ticket_id, t.patient_id, t.queue_number, s.prefix
       FROM tickets t JOIN services s ON s.service_id = t.service_id
      WHERE t.service_id = $1 AND t.queue_date = $2 AND t.status = 'waiting' AND t.is_deleted = FALSE
      ORDER BY t.priority DESC, t.queue_number ASC`,
    [serviceId, date]
  );

  // The first `near_threshold` people in line are "near".
  const nearCount = Math.min(waiting.length, settings.near_threshold);
  for (let ahead = 0; ahead < nearCount; ahead++) {
    const t = waiting[ahead];
    if (!t.patient_id) continue; // walk-ins have no account
    const message = ahead === 0
      ? `${ticketLabel(t)} - you're next! Please be ready.`
      : `${ticketLabel(t)} - your turn is near. ${ahead} ${ahead === 1 ? 'person is' : 'people are'} ahead of you.`;

    // Only one "near" alert per ticket.
    await db.query(
      `INSERT INTO notifications (type, message, patient_id, ticket_id)
       SELECT 'near'::notification_type, $1::varchar, $2::int, $3::int
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications WHERE ticket_id = $3::int AND type = 'near'
        )`,
      [message, t.patient_id, t.ticket_id]
    );
  }
}

// Sends one notification to the patient who owns a ticket.
async function notifyPatient(db, ticket, type, message) {
  if (!ticket.patient_id) return; // walk-ins have no account
  await db.query(
    'INSERT INTO notifications (type, message, patient_id, ticket_id) VALUES ($1, $2, $3, $4)',
    [type, message, ticket.patient_id, ticket.ticket_id]
  );
}

// Tells everyone still waiting in a service that its queue was paused.
async function notifyPaused(db, service, date) {
  const message = `${service.service_name} queue is paused${service.status_note ? `: ${service.status_note}` : '.'}`
    .slice(0, 150);
  await db.query(
    `INSERT INTO notifications (type, message, patient_id, ticket_id)
     SELECT 'paused'::notification_type, $1::varchar, patient_id, ticket_id FROM tickets
      WHERE service_id = $2 AND queue_date = $3 AND status = 'waiting'
        AND is_deleted = FALSE AND patient_id IS NOT NULL`,
    [message, service.service_id, date]
  );
}

module.exports = { checkNearAlerts, notifyPatient, notifyPaused };
