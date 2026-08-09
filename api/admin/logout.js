import { destroySession } from "../_auth.js";

export default async function handler(req, res) {
  res.setHeader("Set-Cookie", await destroySession(req));
  res.status(200).json({ ok: true });
}
