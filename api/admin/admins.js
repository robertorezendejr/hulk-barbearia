import { db } from "../_db.js";
import { requireAuth, hashPassword } from "../_auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const r = await db().execute("SELECT id, email, created_at FROM admin_users ORDER BY created_at");
    return res.status(200).json(r.rows);
  }

  if (req.method === "POST") {
    const { email, password } = req.body || {};
    if (!EMAIL_RE.test(email || "")) return res.status(400).json({ error: "invalid_email" });
    if (!password || password.length < 8) return res.status(400).json({ error: "invalid_password" });
    try {
      await db().execute({
        sql: `INSERT INTO admin_users (email, password_hash, created_at) VALUES (?, ?, ?)`,
        args: [email, hashPassword(password), Date.now()],
      });
    } catch (err) {
      if (String(err.message || "").includes("UNIQUE")) return res.status(409).json({ error: "email_taken" });
      throw err;
    }
    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    const count = await db().execute("SELECT COUNT(*) as n FROM admin_users");
    if (Number(count.rows[0].n) <= 1) return res.status(400).json({ error: "last_admin" });
    await db().execute({ sql: `DELETE FROM admin_users WHERE id = ?`, args: [id] });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
