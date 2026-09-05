import { db } from "./_db.js";

// horários de clientes fixos daquele profissional/dia, descontando datas desmarcadas pontualmente
export async function getRecurringBusy(proId, date) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const r = await db().execute({
    sql: `SELECT ra.time, s.duration_min FROM recurring_appointments ra
          JOIN services s ON s.id = ra.service_id
          WHERE ra.pro_id = ? AND ra.weekday = ?
            AND NOT EXISTS (
              SELECT 1 FROM recurring_exceptions re
              WHERE re.recurring_id = ra.id AND re.date = ?
            )`,
    args: [proId, weekday, date],
  });
  return r.rows.map((row) => ({ time: row.time, duration: row.duration_min }));
}
