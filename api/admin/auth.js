import { checkCredentials, createSession, destroySession, isAuthed } from "../_auth.js";
import { db } from "../_db.js";
import { sendEmail } from "../_email.js";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ATTEMPTS = 5;

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ authed: await isAuthed(req) });
  }

  if (req.method === "POST") {
    const { email, password } = req.body || {};
    if (!email) return res.status(400).json({ error: "invalid_credentials" });

    const since = Date.now() - WINDOW_MS;
    const recent = await db().execute({
      sql: `SELECT COUNT(*) as n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?`,
      args: [email, since],
    });
    if (Number(recent.rows[0].n) >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "too_many_attempts" });
    }

    const ok = await checkCredentials(email, password);

    await db().execute({
      sql: `INSERT INTO login_attempts (ip, email, success, attempted_at) VALUES (?, ?, ?, ?)`,
      args: [clientIp(req), email, ok ? 1 : 0, Date.now()],
    });

    if (!ok) {
      const after = await db().execute({
        sql: `SELECT COUNT(*) as n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?`,
        args: [email, since],
      });
      if (Number(after.rows[0].n) >= MAX_ATTEMPTS) {
        const admins = await db().execute("SELECT email FROM admin_users");
        const to = admins.rows.map((r) => r.email);
        if (to.length) {
          await sendEmail({
            to,
            subject: "Alerta de segurança — Hulk Barbearia",
            text: `A conta ${email} teve 5 tentativas de login erradas e ficou bloqueada por 24 horas.\n\nSe não foi você, considere trocar a senha assim que possível.`,
          });
        }
      }
      return res.status(401).json({ error: "invalid_credentials" });
    }

    res.setHeader("Set-Cookie", await createSession(req));
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", await destroySession(req));
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
