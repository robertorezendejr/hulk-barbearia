import { isAuthed } from "../_auth.js";

export default function handler(req, res) {
  res.status(200).json({ authed: isAuthed(req) });
}
