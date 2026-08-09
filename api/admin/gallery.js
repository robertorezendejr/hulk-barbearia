import { put, del } from "@vercel/blob";
import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM gallery_photos ORDER BY sort_order, id DESC");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { image, caption } = req.body || {};
    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || "");
    if (!match) return res.status(400).json({ error: "invalid_image" });
    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > MAX_BYTES) return res.status(400).json({ error: "image_too_large" });

    const filename = `gallery/${Date.now()}.${MIME_EXT[mime]}`;
    const blob = await put(filename, buffer, { access: "public", contentType: mime });

    await db().execute({
      sql: `INSERT INTO gallery_photos (url, caption, created_at) VALUES (?, ?, ?)`,
      args: [blob.url, caption || null, Date.now()],
    });
    return res.status(201).json({ ok: true, url: blob.url });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    const r = await db().execute({ sql: "SELECT url FROM gallery_photos WHERE id = ?", args: [id] });
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    await del(row.url);
    await db().execute({ sql: "DELETE FROM gallery_photos WHERE id = ?", args: [id] });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
