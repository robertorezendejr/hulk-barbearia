import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

const validText = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM services ORDER BY sort_order");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { name, icon, price, duration_min } = req.body || {};
    if (!validText(name, 80) || !validText(icon, 16)) return res.status(400).json({ error: "invalid_text" });
    if (typeof price !== "number" || price <= 0) return res.status(400).json({ error: "invalid_price" });
    if (!Number.isInteger(duration_min) || duration_min <= 0) return res.status(400).json({ error: "invalid_duration" });

    let id = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "servico";
    const taken = await db().execute({ sql: "SELECT 1 FROM services WHERE id = ?", args: [id] });
    if (taken.rows.length) id += "-" + Date.now().toString(36);

    await db().execute({
      sql: `INSERT INTO services (id, name, icon, price, duration_min, sort_order)
            VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services))`,
      args: [id, name.trim(), icon.trim(), price, duration_min],
    });
    return res.status(201).json({ ok: true, id });
  }

  if (req.method === "PUT") {
    const { id, name, icon, price, duration_min, active } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    if ((name !== undefined && !validText(name, 80)) || (icon !== undefined && !validText(icon, 16))) {
      return res.status(400).json({ error: "invalid_text" });
    }
    if (price !== undefined && (typeof price !== "number" || price <= 0)) {
      return res.status(400).json({ error: "invalid_price" });
    }
    if (duration_min !== undefined && (!Number.isInteger(duration_min) || duration_min <= 0)) {
      return res.status(400).json({ error: "invalid_duration" });
    }
    await db().execute({
      sql: `UPDATE services SET
              name = COALESCE(?, name),
              icon = COALESCE(?, icon),
              price = COALESCE(?, price),
              duration_min = COALESCE(?, duration_min),
              active = COALESCE(?, active)
            WHERE id = ?`,
      args: [
        name?.trim() ?? null,
        icon?.trim() ?? null,
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
