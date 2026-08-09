import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./_db.js";

const COOKIE_NAME = "hulk_admin";
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkCredentials(email, password) {
  if (!email || !password) return false;
  return safeEqual(email, process.env.ADMIN_EMAIL) && safeEqual(password, process.env.ADMIN_PASSWORD);
}

// x-forwarded-proto é setado pelo proxy da Vercel, não pelo cliente — diferente do
// header Host, não dá pra forjar pra desligar o `Secure` em produção.
function secureFlag(req) {
  return req?.headers?.["x-forwarded-proto"] === "https" ? " Secure;" : "";
}

export async function createSession(req) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + MAX_AGE_MS;
  await db().execute({
    sql: `INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`,
    args: [token, expiresAt],
  });
  return `${COOKIE_NAME}=${token}; HttpOnly;${secureFlag(req)} SameSite=Strict; Path=/; Max-Age=${MAX_AGE_MS / 1000}`;
}

export async function destroySession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    await db().execute({ sql: `DELETE FROM admin_sessions WHERE token = ?`, args: [token] });
  }
  return `${COOKIE_NAME}=;${secureFlag(req)} HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function isAuthed(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  const r = await db().execute({
    sql: `SELECT expires_at FROM admin_sessions WHERE token = ?`,
    args: [token],
  });
  const row = r.rows[0];
  return !!row && Number(row.expires_at) > Date.now();
}

export async function requireAuth(req, res) {
  if (!(await isAuthed(req))) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}
