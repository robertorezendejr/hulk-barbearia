import { db } from "./_db.js";
import { createCalendarEvent } from "./_calendar.js";

const PHONE_RE = /^\d{10,13}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 8;

// mesma lista de profissionais válidos usada no front (app.js -> PROS)
const VALID_PRO_IDS = new Set(["luiz"]);

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { pro_id, date } = req.query;
    if (!pro_id || !DATE_RE.test(date || "")) return res.status(400).json({ error: "invalid_params" });
    const [appts, slots] = await Promise.all([
      db().execute({
        sql: `SELECT a.time, s.duration_min FROM appointments a
              JOIN services s ON s.id = a.service_id
              WHERE a.pro_id = ? AND a.date = ? AND a.status = 'confirmed'`,
        args: [pro_id, date],
      }),
      db().execute({ sql: `SELECT time FROM blocked_slots WHERE date = ?`, args: [date] }),
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      // intervalos ocupados (não só o horário de início) para o front detectar sobreposição
      busy: [
        ...appts.rows.map((r) => ({ time: r.time, duration: r.duration_min })),
        ...slots.rows.map((r) => ({ time: r.time, duration: 1 })),
      ],
    });
  }

  if (req.method === "POST") {
    const ip = clientIp(req);
    const since = Date.now() - WINDOW_MS;
    const recent = await db().execute({
      sql: `SELECT COUNT(*) as n FROM booking_attempts WHERE ip = ? AND attempted_at > ?`,
      args: [ip, since],
    });
    if (Number(recent.rows[0].n) >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: "too_many_attempts" });
    }
    await db().execute({
      sql: `INSERT INTO booking_attempts (ip, attempted_at) VALUES (?, ?)`,
      args: [ip, Date.now()],
    });

    const { service_id, pro_id, date, time, customer_name, customer_phone } = req.body || {};
    if (!service_id || !pro_id || !DATE_RE.test(date || "") || !TIME_RE.test(time || "")) {
      return res.status(400).json({ error: "invalid_params" });
    }
    const name = String(customer_name || "").trim();
    const phone = String(customer_phone || "").replace(/\D/g, "");
    if (!name) return res.status(400).json({ error: "invalid_name" });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: "invalid_phone" });
    if (!VALID_PRO_IDS.has(pro_id)) return res.status(400).json({ error: "invalid_pro" });

    const service = await db().execute({
      sql: `SELECT id, name, duration_min FROM services WHERE id = ? AND active = 1`,
      args: [service_id],
    });
    if (!service.rows.length) return res.status(400).json({ error: "invalid_service" });
    const svc = service.rows[0];
    const startMin = toMin(time);
    const endMin = startMin + svc.duration_min;

    const weekday = new Date(`${date}T12:00:00`).getDay();
    const hours = await db().execute({
      sql: `SELECT open_time, close_time, closed FROM business_hours WHERE weekday = ?`,
      args: [weekday],
    });
    const h = hours.rows[0];
    if (!h || h.closed || startMin < toMin(h.open_time) || endMin > toMin(h.close_time)) {
      return res.status(400).json({ error: "closed" });
    }
    const blocked = await db().execute({
      sql: `SELECT 1 FROM blocked_dates WHERE date = ?`,
      args: [date],
    });
    if (blocked.rows.length) return res.status(400).json({ error: "closed" });

    const blockedSlots = await db().execute({
      sql: `SELECT time FROM blocked_slots WHERE date = ?`,
      args: [date],
    });
    const hitsBlockedSlot = blockedSlots.rows.some((r) => {
      const t = toMin(r.time);
      return startMin <= t && t < endMin;
    });
    if (hitsBlockedSlot) return res.status(400).json({ error: "closed" });

    // checa sobreposição real de intervalo (não só o horário de início) com agendamentos confirmados
    const existing = await db().execute({
      sql: `SELECT a.time, s.duration_min FROM appointments a
            JOIN services s ON s.id = a.service_id
            WHERE a.pro_id = ? AND a.date = ? AND a.status = 'confirmed'`,
      args: [pro_id, date],
    });
    const hasOverlap = existing.rows.some((r) => {
      const bStart = toMin(r.time);
      return overlaps(startMin, endMin, bStart, bStart + r.duration_min);
    });
    if (hasOverlap) return res.status(409).json({ error: "slot_taken" });

    let appointmentId;
    try {
      const inserted = await db().execute({
        sql: `INSERT INTO appointments (service_id, pro_id, date, time, customer_name, customer_phone, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [service_id, pro_id, date, time, name, phone, Date.now()],
      });
      appointmentId = inserted.lastInsertRowid;
    } catch (err) {
      if (String(err.message || "").includes("UNIQUE")) {
        return res.status(409).json({ error: "slot_taken" });
      }
      throw err;
    }

    const eventId = await createCalendarEvent({
      summary: `${svc.name} — ${name}`,
      description: `Cliente: ${name}\nWhatsApp: ${phone}`,
      date,
      time,
      durationMin: svc.duration_min,
    });
    if (eventId) {
      await db().execute({
        sql: `UPDATE appointments SET calendar_event_id = ? WHERE id = ?`,
        args: [eventId, appointmentId],
      });
    }

    return res.status(201).json({ ok: true });
  }

  res.status(405).end();
}
