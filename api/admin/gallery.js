import { put, del } from "@vercel/blob";
import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
// ponytail: upload em base64 dentro do JSON, igual à foto; se precisar de vídeos maiores, trocar por upload direto ao Blob
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40MB
const IMAGE_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VIDEO_MIME_EXT = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const INSTAGRAM_RE = /^https:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/;

// celulares gravam em HEVC/H.265, que não roda no Chrome do Android; recodifica pra H.264 sempre.
async function transcodeToH264(buffer, inputExt) {
  const dir = await mkdtemp(join(tmpdir(), "gallery-"));
  const input = join(dir, `in.${inputExt}`);
  const output = join(dir, "out.mp4");
  try {
    await writeFile(input, buffer);
    await execFileAsync(ffmpegPath, [
      "-y", "-i", input,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-movflags", "+faststart",
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT * FROM gallery_photos ORDER BY sort_order, id DESC");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { image, video, instagram_url, caption } = req.body || {};

    if (instagram_url) {
      const m = INSTAGRAM_RE.exec(String(instagram_url).trim());
      if (!m) return res.status(400).json({ error: "invalid_instagram_url" });
      const embedUrl = `https://www.instagram.com/${m[1]}/${m[2]}/embed`;
      await db().execute({
        sql: `INSERT INTO gallery_photos (url, caption, type, created_at) VALUES (?, ?, 'instagram', ?)`,
        args: [embedUrl, caption || null, Date.now()],
      });
      return res.status(201).json({ ok: true, url: embedUrl });
    }

    if (video) {
      const match = /^data:(video\/(?:mp4|webm|quicktime));base64,(.+)$/.exec(video);
      if (!match) return res.status(400).json({ error: "invalid_video" });
      const [, mime, base64] = match;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > MAX_VIDEO_BYTES) return res.status(400).json({ error: "video_too_large" });

      let h264;
      try {
        h264 = await transcodeToH264(buffer, VIDEO_MIME_EXT[mime]);
      } catch {
        return res.status(400).json({ error: "video_transcode_failed" });
      }

      const filename = `gallery/${Date.now()}.mp4`;
      const blob = await put(filename, h264, { access: "public", contentType: "video/mp4" });

      await db().execute({
        sql: `INSERT INTO gallery_photos (url, caption, type, created_at) VALUES (?, ?, 'video', ?)`,
        args: [blob.url, caption || null, Date.now()],
      });
      return res.status(201).json({ ok: true, url: blob.url });
    }

    const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || "");
    if (!match) return res.status(400).json({ error: "invalid_image" });
    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "image_too_large" });

    const filename = `gallery/${Date.now()}.${IMAGE_MIME_EXT[mime]}`;
    const blob = await put(filename, buffer, { access: "public", contentType: mime });

    await db().execute({
      sql: `INSERT INTO gallery_photos (url, caption, type, created_at) VALUES (?, ?, 'photo', ?)`,
      args: [blob.url, caption || null, Date.now()],
    });
    return res.status(201).json({ ok: true, url: blob.url });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    const r = await db().execute({ sql: "SELECT url, type FROM gallery_photos WHERE id = ?", args: [id] });
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.type !== "instagram") await del(row.url);
    await db().execute({ sql: "DELETE FROM gallery_photos WHERE id = ?", args: [id] });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
