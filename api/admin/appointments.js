import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute(
      `SELECT a.id, a.date, a.time, a.customer_name, a.customer_phone, a.status,
              s.name AS service_name, s.price
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE a.status = 'confirmed' AND a.date >= date('now')
       ORDER BY a.date, a.time`
    );
    return res.status(200).json(r.rows);
  }

  if (req.method === "PUT") {
    const { id, status } = req.body || {};
    if (!id || status !== "cancelled") return res.status(400).json({ error: "invalid_params" });
    await db().execute({
      sql: `UPDATE appointments SET status = ? WHERE id = ?`,
      args: [status, id],
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
