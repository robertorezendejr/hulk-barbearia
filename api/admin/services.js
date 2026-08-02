import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM services ORDER BY sort_order");
    return res.status(200).json(r.rows);
  }

  if (req.method === "PUT") {
    const { id, price, duration_min, active } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    if (price !== undefined && (typeof price !== "number" || price <= 0)) {
      return res.status(400).json({ error: "invalid_price" });
    }
    if (duration_min !== undefined && (!Number.isInteger(duration_min) || duration_min <= 0)) {
      return res.status(400).json({ error: "invalid_duration" });
    }
    await db().execute({
      sql: `UPDATE services SET
              price = COALESCE(?, price),
              duration_min = COALESCE(?, duration_min),
              active = COALESCE(?, active)
            WHERE id = ?`,
      args: [
        price ?? null,
        duration_min ?? null,
        active === undefined ? null : active ? 1 : 0,
        id,
      ],
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
