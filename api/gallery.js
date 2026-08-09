import { db } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const r = await db().execute(
    "SELECT id, url, caption FROM gallery_photos ORDER BY sort_order, id DESC"
  );
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(r.rows);
}
