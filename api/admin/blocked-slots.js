import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM blocked_slots ORDER BY date, time");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { date, time, reason } = req.body || {};
    if (!DATE_RE.test(date || "") || !TIME_RE.test(time || "")) {
      return res.status(400).json({ error: "invalid_params" });
    }
    await db().execute({
      sql: `INSERT INTO blocked_slots (date, time, reason) VALUES (?, ?, ?)
            ON CONFLICT(date, time) DO UPDATE SET reason = excluded.reason`,
      args: [date, time, reason || null],
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { date, time } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: "missing_params" });
    await db().execute({ sql: `DELETE FROM blocked_slots WHERE date = ? AND time = ?`, args: [date, time] });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
