// Lembretes de WhatsApp (Evolution API). Regras em WHATSAPP-LEMBRETE.md:
//   antes das 09:00 → 21:00 da véspera
//   09:00–09:45     → 21:00 da véspera + 08:00 do dia
//   10:00 em diante → 08:00 do dia + 1h antes
import { db } from "./api/_db.js";
import { sendEmail } from "./api/_email.js";

const HOUR = 3600e3;
const CANCEL_LIMIT = HOUR; // igual ao CANCEL_LIMIT_MS de api/appointments.js
const LINK_MARGIN = 15 * 60e3; // link só vai se ainda sobrar 15 min de prazo pra cancelar
const SITE = "https://hulkbarbearia.com.br";

// ponytail: fuso fixo -03:00 (Brasil sem horário de verão desde 2019), igual a api/appointments.js
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00-03:00`);
const spDate = (ms) => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);

// horários das mensagens [1ª, 2ª] de um agendamento (2ª pode não existir)
export function schedule(date, time) {
  const start = at(date, time);
  const eve = at(spDate(start - 24 * HOUR), "21:00");
  const morning = at(date, "08:00");
  if (time < "09:00") return [eve];
  if (time < "10:00") return [eve, morning];
  return [morning, start - HOUR];
}

// qual mensagem (1 ou 2) deve sair agora, ou null
export function due(a, now) {
  const start = at(a.date, a.time);
  const times = schedule(a.date, a.time);
  for (let i = times.length - 1; i >= 0; i--) {
    const sent = i === 0 ? a.reminder_1_sent : a.reminder_2_sent;
    const deadline = times[i + 1] ?? start; // atrasou além da próxima mensagem (ou do horário)? perdeu a vez
    if (!sent && now >= times[i] && now < deadline && Number(a.created_at) < times[i]) return i + 1;
    if (now >= times[i]) return null; // só a mensagem mais recente que já venceu pode sair
  }
  return null;
}

export function message(a, now) {
  const [, m, d] = a.date.split("-");
  const canCancel = at(a.date, a.time) - now >= CANCEL_LIMIT + LINK_MARGIN;
  return `${a.customer_name}, você tem um ${a.service_name} no dia ${d}/${m} às ${a.time} na Barbearia do Hulk 👊\n\n` +
    (canCancel ? `Precisa desmarcar? ${SITE}/?meus=${a.customer_phone}` : "Imprevisto? Fale com a barbearia por aqui.");
}

async function send(phone, text) {
  const { EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE = "hulk" } = process.env;
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: "POST",
    headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: `55${phone}`, text }),
  });
  if (!res.ok) throw new Error(`evolution ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let alertedDay = null; // ponytail: 1 e-mail de falha por dia, em memória (zera se reiniciar)
async function alertFailure(err) {
  const today = spDate(Date.now());
  if (alertedDay === today || !process.env.ADMIN_EMAIL) return;
  alertedDay = today;
  await sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: "Lembretes de WhatsApp falhando",
    text: `O envio de lembretes falhou: ${err.message}\n\nVerifique se o WhatsApp do Luiz continua conectado (rode scripts/whatsapp-parear.mjs).`,
  });
}

export async function runReminders(now = Date.now()) {
  const r = await db().execute({
    sql: `SELECT a.id, a.date, a.time, a.customer_name, a.customer_phone, a.created_at,
                 a.reminder_1_sent, a.reminder_2_sent, s.name AS service_name
          FROM appointments a JOIN services s ON s.id = a.service_id
          WHERE a.status = 'confirmed' AND a.date IN (?, ?)
            AND (a.reminder_1_sent IS NULL OR a.reminder_2_sent IS NULL)`,
    args: [spDate(now), spDate(now + 24 * HOUR)],
  });
  const testPhone = process.env.REMINDERS_TEST_PHONE; // definido = só esse número recebe
  for (const a of r.rows) {
    if (testPhone && a.customer_phone !== testPhone) continue;
    const n = due(a, now);
    if (!n) continue;
    const col = `reminder_${n}_sent`;
    // marca antes de enviar: se rodar duas vezes ao mesmo tempo, só uma ganha
    const claim = await db().execute({
      sql: `UPDATE appointments SET ${col} = ? WHERE id = ? AND ${col} IS NULL AND status = 'confirmed'`,
      args: [now, a.id],
    });
    if (claim.rowsAffected !== 1) continue;
    try {
      await send(a.customer_phone, message(a, now));
      console.log(`lembrete ${n} enviado: agendamento ${a.id}`);
    } catch (err) {
      await db().execute({ sql: `UPDATE appointments SET ${col} = NULL WHERE id = ?`, args: [a.id] });
      console.error(`lembrete ${n} falhou: agendamento ${a.id}`, err.message);
      await alertFailure(err);
    }
  }
}
