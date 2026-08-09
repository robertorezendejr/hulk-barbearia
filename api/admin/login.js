import { checkCredentials, createSession } from "../_auth.js";
import { db } from "../_db.js";

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 5;

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const ip = clientIp(req);
  const since = Date.now() - WINDOW_MS;
  const recent = await db().execute({
    sql: `SELECT COUNT(*) as n FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at > ?`,
    args: [ip, since],
  });
  if (Number(recent.rows[0].n) >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: "too_many_attempts" });
  }

  const { email, password } = req.body || {};
  const ok = checkCredentials(email, password);

  await db().execute({
    sql: `INSERT INTO login_attempts (ip, success, attempted_at) VALUES (?, ?, ?)`,
    args: [ip, ok ? 1 : 0, Date.now()],
  });

  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  res.setHeader("Set-Cookie", await createSession(req));
  res.status(200).json({ ok: true });
}
