import { db } from "../_db.js";
import { requireAuth } from "../_auth.js";
import { VALID_PRO_IDS } from "../_pros.js";

const PHONE_RE = /^\d{10,13}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === "GET") {
    const [recurring, exceptions] = await Promise.all([
      db().execute(
        `SELECT ra.id, ra.pro_id, ra.weekday, ra.time, ra.customer_name, ra.customer_phone,
                ra.service_id, s.name AS service_name, s.price
         FROM recurring_appointments ra
         JOIN services s ON s.id = ra.service_id
         ORDER BY ra.weekday, ra.time`
      ),
      db().execute(
        `SELECT recurring_id, date FROM recurring_exceptions WHERE date >= date('now') ORDER BY date`
      ),
    ]);
    return res.status(200).json({ recurring: recurring.rows, exceptions: exceptions.rows });
  }

  if (req.method === "POST") {
    const { pro_id, weekday, time, service_id, customer_name, customer_phone } = req.body || {};
    if (!VALID_PRO_IDS.has(pro_id)) return res.status(400).json({ error: "invalid_pro" });
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return res.status(400).json({ error: "invalid_weekday" });
    }
    if (!TIME_RE.test(time || "")) return res.status(400).json({ error: "invalid_params" });
    const name = String(customer_name || "").trim();
    let phone = String(customer_phone || "").replace(/\D/g, "");
    if (phone.length >= 12) phone = phone.slice(-11);
    if (!name) return res.status(400).json({ error: "invalid_name" });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: "invalid_phone" });

    const service = await db().execute({
      sql: `SELECT id FROM services WHERE id = ? AND active = 1`,
      args: [service_id],
    });
    if (!service.rows.length) return res.status(400).json({ error: "invalid_service" });

    try {
      await db().execute({
        sql: `INSERT INTO recurring_appointments (pro_id, weekday, time, service_id, customer_name, customer_phone, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [pro_id, weekday, time, service_id, name, phone, Date.now()],
      });
    } catch (err) {
      if (String(err.message || "").includes("UNIQUE")) {
        return res.status(409).json({ error: "slot_taken" });
      }
      throw err;
    }
    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });
    await db().execute({ sql: `DELETE FROM recurring_exceptions WHERE recurring_id = ?`, args: [id] });
    await db().execute({ sql: `DELETE FROM recurring_appointments WHERE id = ?`, args: [id] });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PUT") {
    const { id, date, cancel, customer_name, customer_phone, service_id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing_id" });

    if (date !== undefined) {
      // desmarca (ou reverte a desmarcação de) uma data pontual, sem apagar a recorrência
      if (!DATE_RE.test(date || "")) return res.status(400).json({ error: "invalid_params" });
      if (cancel) {
        await db().execute({
          sql: `INSERT INTO recurring_exceptions (recurring_id, date) VALUES (?, ?)
                ON CONFLICT(recurring_id, date) DO NOTHING`,
          args: [id, date],
        });
      } else {
        await db().execute({
          sql: `DELETE FROM recurring_exceptions WHERE recurring_id = ? AND date = ?`,
          args: [id, date],
        });
      }
      return res.status(200).json({ ok: true });
    }

    // edita nome, whatsapp ou serviço do cliente fixo (corrige erro de cadastro)
    let name = null;
    if (customer_name !== undefined) {
      name = String(customer_name).trim();
      if (!name) return res.status(400).json({ error: "invalid_name" });
    }

    let phone = null;
    if (customer_phone !== undefined) {
      phone = String(customer_phone).replace(/\D/g, "");
      if (phone.length >= 12) phone = phone.slice(-11);
      if (!PHONE_RE.test(phone)) return res.status(400).json({ error: "invalid_phone" });
    }

    if (service_id !== undefined) {
      const service = await db().execute({
        sql: `SELECT id FROM services WHERE id = ? AND active = 1`,
        args: [service_id],
      });
      if (!service.rows.length) return res.status(400).json({ error: "invalid_service" });
    }

    await db().execute({
      sql: `UPDATE recurring_appointments SET
              customer_name = COALESCE(?, customer_name),
              customer_phone = COALESCE(?, customer_phone),
              service_id = COALESCE(?, service_id)
            WHERE id = ?`,
      args: [name, phone, service_id ?? null, id],
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
