import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM business_hours ORDER BY weekday");
    return res.status(200).json(r.rows);
  }

  if (req.method === "PUT") {
    const { weekday, open_time, close_time, closed } = req.body || {};
    if (weekday === undefined || weekday < 0 || weekday > 6) {
      return res.status(400).json({ error: "invalid_weekday" });
    }
    await db().execute({
      sql: `UPDATE business_hours SET open_time = ?, close_time = ?, closed = ? WHERE weekday = ?`,
      args: [closed ? null : open_time, closed ? null : close_time, closed ? 1 : 0, weekday],
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
