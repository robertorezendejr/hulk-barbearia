import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "hulk_admin";
const MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8h

function sign(value) {
  return createHmac("sha256", process.env.ADMIN_SECRET).update(value).digest("hex");
}

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

// ponytail: host-based check instead of proper TLS detection — good enough since
// Vercel always serves production over HTTPS, this only relaxes `Secure` for local dev.
function secureFlag(req) {
  const host = req?.headers?.host || "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "" : " Secure;";
}

export function createSessionCookie(req) {
  const expires = Date.now() + MAX_AGE_MS;
  const payload = `${expires}`;
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; HttpOnly;${secureFlag(req)} SameSite=Strict; Path=/; Max-Age=${MAX_AGE_MS / 1000}`;
}

export function clearSessionCookie(req) {
  return `${COOKIE_NAME}=;${secureFlag(req)} HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

export function isAuthed(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload))) return false;
  return Number(payload) > Date.now();
}

export function requireAuth(req, res) {
  if (!isAuthed(req)) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}
