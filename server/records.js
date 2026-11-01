// Ticket searching and ticket details, shared by the staff and admin "queue records" screens.
const { WAIT_MINUTES, SERVICE_MINUTES, ticketLabel, toId } = require('./helpers');

const escapeLike = s => s.replace(/[\\%_]/g, '\\$&');

const decorate = t => ({
  ...t,
  ticket_label: ticketLabel(t),
  display_name: t.patient_name || t.walk_in_name,
});

const SELECT_COLUMNS = `
  t.*, s.service_name, s.prefix, p.full_name AS patient_name, st.full_name AS staff_name,
  ${WAIT_MINUTES} AS wait_minutes, ${SERVICE_MINUTES} AS service_minutes`;

const FROM_TICKETS = `
  FROM tickets t
  JOIN services s ON s.service_id = t.service_id
  LEFT JOIN patients p ON p.patient_id = t.patient_id
  LEFT JOIN staff st ON st.staff_id = t.staff_id`;

// Tickets in a date range, with search and paging.
// f = { from, to, status, q, serviceIds (array or null = all), deleted: 'exclude'|'only'|'include', limit, offset }
async function searchTickets(db, f) {
  const filter = `
    ${FROM_TICKETS}
    WHERE t.queue_date BETWEEN $1::date AND $2::date
      AND ($3::text = 'include' OR t.is_deleted = ($3::text = 'only'))
      AND ($4::text IS NULL OR t.status::text = $4::text)
      AND ($5::int[] IS NULL OR t.service_id = ANY($5::int[]))
      AND ($6::text IS NULL
           OR COALESCE(p.full_name, t.walk_in_name, '') ILIKE $6::text
           OR (s.prefix || '-' || LPAD(t.queue_number::text, 3, '0')) ILIKE $6::text)`;
  const params = [
    f.from, f.to, f.deleted || 'exclude', f.status || null, f.serviceIds || null,
    f.q ? `%${escapeLike(f.q)}%` : null,
  ];
  const { rows: count } = await db.query(`SELECT COUNT(*) AS n ${filter}`, params);
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} ${filter}
      ORDER BY t.queue_date DESC, s.service_name, t.queue_number ASC LIMIT $7 OFFSET $8`,
    [...params, f.limit, f.offset]
  );
  return { total: count[0].n, tickets: rows.map(decorate) };
}

// One ticket with its status history. serviceIds limits which services may be viewed (null = any).
async function ticketDetails(db, ticketId, serviceIds) {
  const id = toId(ticketId);
  if (!id) return null;
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS} ${FROM_TICKETS}
      WHERE t.ticket_id = $1 AND ($2::int[] IS NULL OR t.service_id = ANY($2::int[]))`,
    [id, serviceIds || null]
  );
  if (!rows[0]) return null;
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
    [id]
  );
  return { ...decorate(rows[0]), history };
}

module.exports = { searchTickets, ticketDetails, decorate };
