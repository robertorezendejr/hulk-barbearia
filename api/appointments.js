import { randomInt } from "node:crypto";
import { db } from "./_db.js";
import { createCalendarEvent, deleteCalendarEvent } from "./_calendar.js";
import { getRecurringBusy } from "./_recurring.js";
import { VALID_PRO_IDS } from "./_pros.js";

const PHONE_RE = /^\d{10,13}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 8;
const CANCEL_LIMIT_MS = 60 * 60 * 1000; // cliente só cancela pelo site até 1h antes
// sem 0/O/1/I/L pra não confundir na hora de digitar
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCancelCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// limita tentativas por IP (marcação e cancelamento) — também impede chutar códigos de cancelamento
async function tooManyAttempts(req) {
  const ip = clientIp(req);
  const recent = await db().execute({
    sql: `SELECT COUNT(*) as n FROM booking_attempts WHERE ip = ? AND attempted_at > ?`,
    args: [ip, Date.now() - WINDOW_MS],
  });
  if (Number(recent.rows[0].n) >= MAX_ATTEMPTS) return true;
  await db().execute({
    sql: `INSERT INTO booking_attempts (ip, attempted_at) VALUES (?, ?)`,
    args: [ip, Date.now()],
  });
  return false;
}

const normalizePhone = (raw) => {
  const phone = String(raw || "").replace(/\D/g, "");
  return phone.length >= 12 ? phone.slice(-11) : phone; // remove o "55" se o cliente digitou com DDI
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { pro_id, date } = req.query;
    if (!pro_id || !DATE_RE.test(date || "")) return res.status(400).json({ error: "invalid_params" });
    const [appts, slots, recurring] = await Promise.all([
      db().execute({
        sql: `SELECT a.time, s.duration_min FROM appointments a
              JOIN services s ON s.id = a.service_id
              WHERE a.pro_id = ? AND a.date = ? AND a.status = 'confirmed'`,
        args: [pro_id, date],
      }),
      db().execute({ sql: `SELECT time FROM blocked_slots WHERE date = ?`, args: [date] }),
      getRecurringBusy(pro_id, date),
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      // intervalos ocupados (não só o horário de início) para o front detectar sobreposição
      busy: [
        ...appts.rows.map((r) => ({ time: r.time, duration: r.duration_min })),
        ...slots.rows.map((r) => ({ time: r.time, duration: 1 })),
        ...recurring,
      ],
    });
  }

  if (req.method === "POST") {
    if (await tooManyAttempts(req)) return res.status(429).json({ error: "too_many_attempts" });

    const { service_id, pro_id, date, time, customer_name, customer_phone } = req.body || {};
    if (!service_id || !pro_id || !DATE_RE.test(date || "") || !TIME_RE.test(time || "")) {
      return res.status(400).json({ error: "invalid_params" });
    }
    const name = String(customer_name || "").trim();
    const phone = normalizePhone(customer_phone);
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
    const [existing, recurringBusy] = await Promise.all([
      db().execute({
        sql: `SELECT a.time, s.duration_min FROM appointments a
              JOIN services s ON s.id = a.service_id
              WHERE a.pro_id = ? AND a.date = ? AND a.status = 'confirmed'`,
        args: [pro_id, date],
      }),
      getRecurringBusy(pro_id, date),
    ]);
    const hasOverlap = [...existing.rows, ...recurringBusy].some((r) => {
      const bStart = toMin(r.time);
      return overlaps(startMin, endMin, bStart, bStart + (r.duration_min ?? r.duration));
    });
    if (hasOverlap) return res.status(409).json({ error: "slot_taken" });

    let appointmentId;
    const cancelCode = newCancelCode();
    try {
      const inserted = await db().execute({
        sql: `INSERT INTO appointments (service_id, pro_id, date, time, customer_name, customer_phone, cancel_code, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [service_id, pro_id, date, time, name, phone, cancelCode, Date.now()],
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

    return res.status(201).json({ ok: true, cancel_code: cancelCode });
  }

  // cancelamento pelo próprio cliente: celular + código. Sem confirm → só mostra o agendamento.
  // ponytail: fica neste arquivo de propósito — plano Hobby da Vercel já está no limite de 12 funções
  if (req.method === "PATCH") {
    if (await tooManyAttempts(req)) return res.status(429).json({ error: "too_many_attempts" });
    const { customer_phone, cancel_code, confirm } = req.body || {};
    const phone = normalizePhone(customer_phone);
    const code = String(cancel_code || "").trim().toUpperCase();
    if (!PHONE_RE.test(phone) || !code) return res.status(400).json({ error: "invalid_params" });

    const r = await db().execute({
      sql: `SELECT a.id, a.date, a.time, a.customer_name, a.calendar_event_id, s.name AS service_name
            FROM appointments a JOIN services s ON s.id = a.service_id
            WHERE a.customer_phone = ? AND a.cancel_code = ? AND a.status = 'confirmed'`,
      args: [phone, code],
    });
    const appt = r.rows[0];
    if (!appt) return res.status(404).json({ error: "not_found" });

    // ponytail: fuso fixo -03:00 (Brasil sem horário de verão desde 2019); usar Intl se voltar
    const startsAt = Date.parse(`${appt.date}T${appt.time}:00-03:00`);
    const info = { date: appt.date, time: appt.time, service_name: appt.service_name, customer_name: appt.customer_name };
    if (startsAt - Date.now() < CANCEL_LIMIT_MS) return res.status(409).json({ error: "too_late", ...info });
    if (!confirm) return res.status(200).json(info);

    await db().execute({
      sql: `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
      args: [appt.id],
    });
    await deleteCalendarEvent(appt.calendar_event_id);
    return res.status(200).json({ ok: true, ...info });
  }

  res.status(405).end();
}
