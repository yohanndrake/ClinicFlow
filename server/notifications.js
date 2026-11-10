//create patient notifications: near alerts, single messages and paused notices
const { clinicNow, getSettings, ticketLabel, isNear } = require("./helpers");

//send near alerts for one service, once each: "you're next" to the first, "near" to the next few,
//and "head to the clinic" to anyone whose estimated wait is no longer than their travel time
async function checkNearAlerts(db, serviceId) {
  //load the near threshold and today's clinic date
  const settings = await getSettings(db);
  const { date } = clinicNow(settings.time_zone);

  //get today's waiting tickets in queue order, with travel time and the service's average minutes
  const { rows: waiting } = await db.query(
    `SELECT t.ticket_id, t.patient_id, t.queue_number, t.travel_minutes, s.prefix, s.avg_service_minutes
       FROM tickets t JOIN services s ON s.service_id = t.service_id
      WHERE t.service_id = $1 AND t.queue_date = $2 AND t.status = 'waiting' AND t.is_deleted = FALSE
      ORDER BY t.priority DESC, t.queue_number ASC`,
    [serviceId, date],
  );

  //go through the waiting tickets, skipping walk-ins and anyone not near yet, and alert each patient once
  for (let ahead = 0; ahead < waiting.length; ahead++) {
    const t = waiting[ahead];
    if (!t.patient_id) continue;
    if (!isNear(ahead, t.avg_service_minutes, t.travel_minutes, settings.near_threshold)) continue;
    const wait = ahead * t.avg_service_minutes;
    let message;
    if (ahead === 0) message = `${ticketLabel(t)} - you're next! Please be ready.`;
    else if (ahead < settings.near_threshold)
      message = `${ticketLabel(t)} - your turn is near. ${ahead} ${ahead === 1 ? "person is" : "people are"} ahead of you.`;
    else
      message = `${ticketLabel(t)} - time to head to the clinic. About ${wait} min until your turn, and your travel time is ${t.travel_minutes} min.`;

    //notify the patient by saving a near alert to notifications, only once per ticket
    await db.query(
      `INSERT INTO notifications (type, message, patient_id, ticket_id)
       SELECT 'near'::notification_type, $1::varchar, $2::int, $3::int
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications WHERE ticket_id = $3::int AND type = 'near'
        )`,
      [message, t.patient_id, t.ticket_id],
    );
  }
}

//notify the patient by saving a message of any type to notifications, skipping walk-ins
async function notifyPatient(db, ticket, type, message) {
  if (!ticket.patient_id) return;
  await db.query(
    "INSERT INTO notifications (type, message, patient_id, ticket_id) VALUES ($1, $2, $3, $4)",
    [type, message, ticket.patient_id, ticket.ticket_id],
  );
}

//notify every waiting patient of a paused service, with the staff note if there is one
async function notifyPaused(db, service, date) {
  const message =
    `${service.service_name} queue is paused${service.status_note ? `: ${service.status_note}` : "."}`.slice(
      0,
      150,
    );
  await db.query(
    `INSERT INTO notifications (type, message, patient_id, ticket_id)
     SELECT 'paused'::notification_type, $1::varchar, patient_id, ticket_id FROM tickets
      WHERE service_id = $2 AND queue_date = $3 AND status = 'waiting'
        AND is_deleted = FALSE AND patient_id IS NOT NULL`,
    [message, service.service_id, date],
  );
}

//share the three functions with the route files
module.exports = { checkNearAlerts, notifyPatient, notifyPaused };
