//records.js - the shared ticket search used by both the staff and admin "Queue Records"
//pages. One query builder, so both roles behave the same.

//imports: SQL pieces for wait and service minutes, the label maker and the id checker.
const {
  WAIT_MINUTES,
  SERVICE_MINUTES,
  ticketLabel,
  toId,
} = require("./helpers");

//escape % _ and backslashes in search text, so they match literally
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

//add a ticket label and a display name to each ticket row
const decorate = (t) => ({
  ...t,
  ticket_label: ticketLabel(t),
  display_name: t.patient_name || t.walk_in_name,
});

//the columns every record query returns, including names and timing
const SELECT_COLUMNS = `
  t.*, s.service_name, s.prefix, p.full_name AS patient_name, st.full_name AS staff_name,
  ${WAIT_MINUTES} AS wait_minutes, ${SERVICE_MINUTES} AS service_minutes`;

//the tables and joins used by every record query
const FROM_TICKETS = `
  FROM tickets t
  JOIN services s ON s.service_id = t.service_id
  LEFT JOIN patients p ON p.patient_id = t.patient_id
  LEFT JOIN staff st ON st.staff_id = t.staff_id`;

//search tickets with the given filters, and return one page plus the total count
async function searchTickets(db, f) {
  //filters for the search: date range, deleted mode, status, services and text
  const filter = `
    ${FROM_TICKETS}
    WHERE t.queue_date BETWEEN $1::date AND $2::date
      AND ($3::text = 'include' OR t.is_deleted = ($3::text = 'only'))
      AND ($4::text IS NULL OR t.status::text = $4::text)
      AND ($5::int[] IS NULL OR t.service_id = ANY($5::int[]))
      AND ($6::text IS NULL
           OR COALESCE(p.full_name, t.walk_in_name, '') ILIKE $6::text
           OR (s.prefix || '-' || LPAD(t.queue_number::text, 3, '0')) ILIKE $6::text)`;

  //the values for $1 to $6, filled with safe defaults.
  const params = [
    f.from,
    f.to,
    f.deleted || "exclude",
    f.status || null,
    f.serviceIds || null,
    f.q ? `%${escapeLike(f.q)}%` : null,
  ];

  //count all matches, then fetch only this page of rows, newest first
  const { rows: count } = await db.query(
    `SELECT COUNT(*) AS n ${filter}`,
    params,
  );
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} ${filter}
      ORDER BY t.queue_date DESC, t.queued_at DESC, t.ticket_id DESC LIMIT $7 OFFSET $8`,
    [...params, f.limit, f.offset],
  );

  //send back the total count and this page of tickets, with labels added
  return { total: count[0].n, tickets: rows.map(decorate) };
}

//load one ticket and its history, only if the caller may see its service
async function ticketDetails(db, ticketId, serviceIds) {
  const id = toId(ticketId);
  if (!id) return null;
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} ${FROM_TICKETS}
      WHERE t.ticket_id = $1 AND ($2::int[] IS NULL OR t.service_id = ANY($2::int[]))`,
    [id, serviceIds || null],
  );
  if (!rows[0]) return null;

  //get the ticket's history lines, with who made each change
  const { rows: history } = await db.query(
    `SELECT h.action, h.reason, h.changed_at,
            COALESCE(st.full_name, ad.full_name, pt.full_name) AS by_name,
            CASE WHEN h.staff_id IS NOT NULL THEN 'staff' WHEN h.admin_id IS NOT NULL THEN 'admin'
                 WHEN h.patient_id IS NOT NULL THEN 'patient' ELSE 'system' END AS by_role
       FROM ticket_history h
       LEFT JOIN staff st ON st.staff_id = h.staff_id
       LEFT JOIN admins ad ON ad.admin_id = h.admin_id
       LEFT JOIN patients pt ON pt.patient_id = h.patient_id
      WHERE h.ticket_id = $1 ORDER BY h.changed_at, h.history_id`,
    [id],
  );

  //return the ticket together with its history.
  return { ...decorate(rows[0]), history };
}

//share the search and details functions
module.exports = { searchTickets, ticketDetails, decorate };
