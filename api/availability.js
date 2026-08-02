import { db } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const hours = await db().execute(
    "SELECT weekday, open_time, close_time, closed FROM business_hours ORDER BY weekday"
  );
  const blocked = await db().execute(
    "SELECT date, reason FROM blocked_dates ORDER BY date"
  );
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ hours: hours.rows, blockedDates: blocked.rows });
}
