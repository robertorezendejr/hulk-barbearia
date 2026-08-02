import { checkCredentials, createSessionCookie } from "../_auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const { email, password } = req.body || {};
  if (!checkCredentials(email, password)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  res.setHeader("Set-Cookie", createSessionCookie(req));
  res.status(200).json({ ok: true });
}
