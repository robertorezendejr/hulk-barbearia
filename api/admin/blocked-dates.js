import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM blocked_dates ORDER BY date");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { date, reason } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "invalid_date" });
    }
    await db().execute({
      sql: `INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
            ON CONFLICT(date) DO UPDATE SET reason = excluded.reason`,
      args: [date, reason || null],
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { date } = req.body || {};
    if (!date) return res.status(400).json({ error: "missing_date" });
    await db().execute({ sql: `DELETE FROM blocked_dates WHERE date = ?`, args: [date] });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
