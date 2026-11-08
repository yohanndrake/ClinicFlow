//jobs.js - the background clean-up that runs every minute (started in server.js).
//finds tickets that can no longer be served and marks them "skipped".

//imports - the database pool, time and settings helpers, and the near-alert check.
const pool = require("./db");
const { clinicNow, getSettings, ticketLabel } = require("./helpers");
const { checkNearAlerts } = require("./notifications");

//log each expired ticket in ticket_history, and notify registered patients
async function recordExpired(db, rows, reason, text) {
  for (const t of rows) {
    await db.query(
      "INSERT INTO ticket_history (action, reason, ticket_id) VALUES ('expired', $1, $2)",
      [reason, t.ticket_id],
    );
    if (t.patient_id) {
      await db.query(
        "INSERT INTO notifications (type, message, patient_id, ticket_id) VALUES ('skipped', $1, $2, $3)",
        [`${ticketLabel(t)} - ${text}`, t.patient_id, t.ticket_id],
      );
    }
  }
}

//runs all expiry changes in one transaction, so they are saved together or undone together.
async function expireTickets() {
  //borrow a connection and start the transaction
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    //loads the clinic settings and find out the clinic's current date and time
    const settings = await getSettings(client);
    const { date, time } = clinicNow(settings.time_zone);

    //skip called tickets whose patient never arrived within the grace period
    const noShowReason = "No show after being called";
    const { rows: noShows } = await client.query(
      `UPDATE tickets t SET status = 'skipped', status_reason = $1
         FROM services s
        WHERE s.service_id = t.service_id AND t.is_deleted = FALSE
          AND t.status = 'serving' AND t.arrived_at IS NULL
          AND t.called_at < NOW() - ($2::int * INTERVAL '1 minute')
        RETURNING t.ticket_id, t.patient_id, t.queue_number, t.service_id, s.prefix`,
      [noShowReason, settings.grace_minutes],
    );
    await recordExpired(
      client,
      noShows,
      noShowReason,
      "you did not arrive in time, so your ticket expired.",
    );

    //skip leftover tickets from past days, and waiting tickets after the service closes.
    const closedReason = "Queue closed";
    const { rows: closed } = await client.query(
      `UPDATE tickets t SET status = 'skipped', status_reason = $1
         FROM services s
        WHERE s.service_id = t.service_id AND t.is_deleted = FALSE
          AND ((t.queue_date < $2::date AND t.status IN ('waiting', 'serving'))
            OR (t.queue_date = $2::date AND t.status = 'waiting' AND s.close_time <= $3::time))
        RETURNING t.ticket_id, t.patient_id, t.queue_number, t.service_id, s.prefix`,
      [closedReason, date, time],
    );
    await recordExpired(
      client,
      closed,
      closedReason,
      "the queue closed before your turn, so your ticket expired.",
    );

    //after skipping tickets, re-check near alerts once for each affected service
    const serviceIds = new Set(
      [...noShows, ...closed].map((t) => t.service_id),
    );
    for (const id of serviceIds) await checkNearAlerts(client, id);

    //save everything and report how many tickets were expired
    await client.query("COMMIT");
    return noShows.length + closed.length;
  } catch (err) {
    //if something fails undo every change from this run, then pass the error on
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    //always give the connection back to the pool.
    client.release();
  }
}

//share the job with server.js.
module.exports = { expireTickets };
