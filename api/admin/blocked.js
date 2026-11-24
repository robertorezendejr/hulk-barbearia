import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";
import { normalizePhone } from "../appointments.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const PHONE_RE = /^\d{10,11}$/;

// ponytail: clientes bloqueados (por celular) moram aqui junto com dias/horários — mesmo assunto, sem função nova
export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const [dates, slots, customers] = await Promise.all([
      db().execute("SELECT * FROM blocked_dates ORDER BY date"),
      db().execute("SELECT * FROM blocked_slots ORDER BY date, time"),
      db().execute("SELECT * FROM blocked_customers ORDER BY created_at DESC"),
    ]);
    return res.status(200).json({ dates: dates.rows, slots: slots.rows, customers: customers.rows });
  }

  if (req.method === "POST") {
    const { date, time, reason, phone, name } = req.body || {};

    if (phone !== undefined) {
      const p = normalizePhone(phone);
      if (!PHONE_RE.test(p)) return res.status(400).json({ error: "invalid_phone" });
      await db().execute({
        sql: `INSERT INTO blocked_customers (phone, name, reason, created_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, name), reason = COALESCE(excluded.reason, reason)`,
        args: [p, String(name || "").trim() || null, String(reason || "").trim() || null, Date.now()],
      });
      return res.status(200).json({ ok: true });
    }

    if (!DATE_RE.test(date || "")) return res.status(400).json({ error: "invalid_date" });

    if (time) {
      if (!TIME_RE.test(time)) return res.status(400).json({ error: "invalid_params" });
      await db().execute({
        sql: `INSERT INTO blocked_slots (date, time, reason) VALUES (?, ?, ?)
              ON CONFLICT(date, time) DO UPDATE SET reason = excluded.reason`,
        args: [date, time, reason || null],
      });
    } else {
      await db().execute({
        sql: `INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
              ON CONFLICT(date) DO UPDATE SET reason = excluded.reason`,
        args: [date, reason || null],
      });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { date, time, phone } = req.body || {};
    if (phone) {
      await db().execute({ sql: `DELETE FROM blocked_customers WHERE phone = ?`, args: [normalizePhone(phone)] });
      return res.status(200).json({ ok: true });
    }
    if (!date) return res.status(400).json({ error: "missing_date" });
    if (time) {
      await db().execute({ sql: `DELETE FROM blocked_slots WHERE date = ? AND time = ?`, args: [date, time] });
    } else {
      await db().execute({ sql: `DELETE FROM blocked_dates WHERE date = ?`, args: [date] });
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
