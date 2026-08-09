import { isAuthed } from "../_auth.js";

export default async function handler(req, res) {
  res.status(200).json({ authed: await isAuthed(req) });
}
