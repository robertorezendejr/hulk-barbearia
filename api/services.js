import { db } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const r = await db().execute(
    "SELECT id, name, icon, price, duration_min, sort_order FROM services WHERE active = 1 ORDER BY sort_order"
  );
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(r.rows);
}
