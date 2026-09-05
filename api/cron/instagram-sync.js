import { put } from "@vercel/blob";
import { db } from "../_db.js";

const IMPORT_LIMIT = 8;

// puxa as últimas fotos do Instagram do profissional e sobe na galeria, sem repetir o que já foi importado antes
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) return res.status(500).json({ error: "instagram_not_configured" });

  const fields = "id,media_type,media_url,timestamp";
  const url = `https://graph.instagram.com/${userId}/media?fields=${fields}&limit=${IMPORT_LIMIT}&access_token=${token}`;
  const mediaRes = await fetch(url);
  if (!mediaRes.ok) {
    return res.status(502).json({ error: "instagram_api_error", detail: await mediaRes.text() });
  }
  const { data } = await mediaRes.json();
  // ponytail: CAROUSEL_ALBUM entra pela foto de capa; as demais fotos do álbum não são importadas
  const photos = (data || []).filter((m) => m.media_type !== "VIDEO").slice(0, IMPORT_LIMIT);

  let imported = 0;
  for (const media of photos) {
    const exists = await db().execute({
      sql: "SELECT 1 FROM gallery_photos WHERE instagram_media_id = ?",
      args: [media.id],
    });
    if (exists.rows.length) continue;

    const imgRes = await fetch(media.media_url);
    if (!imgRes.ok) continue;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`gallery/instagram-${media.id}.jpg`, buffer, { access: "public", contentType: "image/jpeg" });

    await db().execute({
      sql: `INSERT INTO gallery_photos (url, instagram_media_id, created_at) VALUES (?, ?, ?)`,
      args: [blob.url, media.id, Date.now()],
    });
    imported++;
  }

  res.status(200).json({ ok: true, imported });
}
