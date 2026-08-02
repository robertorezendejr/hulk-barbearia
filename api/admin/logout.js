import { clearSessionCookie } from "../_auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  res.status(200).json({ ok: true });
}
