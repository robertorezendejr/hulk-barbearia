import { JWT } from "google-auth-library";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

let jwtClient;
function client() {
  if (!jwtClient) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    jwtClient = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }
  return jwtClient;
}

function addMinutes(time, durationMin) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durationMin;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* cria o evento na agenda da barbearia; retorna o id do evento ou null se falhar/não configurado */
export async function createCalendarEvent({ summary, description, date, time, durationMin }) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !CALENDAR_ID) return null;
  try {
    const { token } = await client().getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: `${date}T${time}:00`, timeZone: "America/Sao_Paulo" },
          end: { dateTime: `${date}T${addMinutes(time, durationMin)}:00`, timeZone: "America/Sao_Paulo" },
        }),
      }
    );
    if (!res.ok) {
      console.error("google_calendar_create_failed", res.status, await res.text());
      return null;
    }
    const event = await res.json();
    return event.id;
  } catch (err) {
    console.error("google_calendar_create_error", err);
    return null;
  }
}

/* remove o evento da agenda; silencioso se não configurado ou já não existir */
export async function deleteCalendarEvent(eventId) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !CALENDAR_ID || !eventId) return;
  try {
    const { token } = await client().getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      console.error("google_calendar_delete_failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("google_calendar_delete_error", err);
  }
}
