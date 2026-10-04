import { createClient } from "@libsql/client";
import { hashPassword } from "../api/_auth.js";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.executeMultiple(`
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✂️',
  price REAL NOT NULL,
  duration_min INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS business_hours (
  weekday INTEGER PRIMARY KEY,
  open_time TEXT,
  close_time TEXT,
  closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_dates (
  date TEXT PRIMARY KEY,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts (ip, attempted_at);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL REFERENCES services(id),
  pro_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_pro_date ON appointments (pro_id, date);
-- impede dois agendamentos confirmados no mesmo horário/profissional (cancelados liberam o horário)
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot ON appointments (pro_id, date, time) WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (date, time)
);

CREATE TABLE IF NOT EXISTS booking_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_attempts_ip_time ON booking_attempts (ip, attempted_at);

-- clientes fixos: reservam o mesmo horário toda semana, indefinidamente
CREATE TABLE IF NOT EXISTS recurring_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pro_id TEXT NOT NULL,
  weekday INTEGER NOT NULL, -- 0=domingo ... 6=sábado
  time TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES services(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_slot ON recurring_appointments (pro_id, weekday, time);

-- desmarcação pontual: libera o horário do cliente fixo numa data específica, sem apagar a recorrência
CREATE TABLE IF NOT EXISTS recurring_exceptions (
  recurring_id INTEGER NOT NULL REFERENCES recurring_appointments(id),
  date TEXT NOT NULL,
  PRIMARY KEY (recurring_id, date)
);
`);

// SQLite não suporta "ADD COLUMN IF NOT EXISTS" — ignora erro se a coluna já existir
try {
  await db.execute("ALTER TABLE appointments ADD COLUMN calendar_event_id TEXT");
} catch (err) {
  if (!String(err.message).includes("duplicate column")) throw err;
}
try {
  await db.execute("ALTER TABLE login_attempts ADD COLUMN email TEXT");
} catch (err) {
  if (!String(err.message).includes("duplicate column")) throw err;
}
await db.execute("CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts (email, attempted_at)");

// código que o cliente usa (junto com o celular) pra cancelar o próprio agendamento pelo site
try {
  await db.execute("ALTER TABLE appointments ADD COLUMN cancel_code TEXT");
} catch (err) {
  if (!String(err.message).includes("duplicate column")) throw err;
}

// marca fotos importadas automaticamente do Instagram, pra não importar a mesma foto duas vezes
try {
  await db.execute("ALTER TABLE gallery_photos ADD COLUMN instagram_media_id TEXT");
} catch (err) {
  if (!String(err.message).includes("duplicate column")) throw err;
}
await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_instagram_media ON gallery_photos (instagram_media_id)");

// distingue foto / vídeo enviado / vídeo do Instagram incorporado na galeria
try {
  await db.execute("ALTER TABLE gallery_photos ADD COLUMN type TEXT NOT NULL DEFAULT 'photo'");
} catch (err) {
  if (!String(err.message).includes("duplicate column")) throw err;
}

// lembretes de WhatsApp: horário (ms) em que a 1ª / 2ª mensagem saiu (ver reminders.js)
for (const col of ["reminder_1_sent", "reminder_2_sent"]) {
  try {
    await db.execute(`ALTER TABLE appointments ADD COLUMN ${col} INTEGER`);
  } catch (err) {
    if (!String(err.message).includes("duplicate column")) throw err;
  }
}

// promove o admin das variáveis de ambiente pro banco (bootstrap do primeiro admin)
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  await db.execute({
    sql: `INSERT INTO admin_users (email, password_hash, created_at) VALUES (?, ?, ?)
          ON CONFLICT(email) DO NOTHING`,
    args: [process.env.ADMIN_EMAIL, hashPassword(process.env.ADMIN_PASSWORD), Date.now()],
  });
}

const services = [
  ["corte-simples", "Corte Simples", "✂️", 35, 30, 1],
  ["corte-disfarcado", "Corte Disfarçado", "✂️", 40, 45, 2],
  ["barba", "Barba Comum", "🧔", 25, 30, 3],
  ["corte-barba", "Corte + Barba", "🔥", 60, 60, 4],
  ["barboterapia", "Barboterapia com vapor de ozônio", "💈", 80, 60, 5],
];
for (const [id, name, icon, price, duration_min, sort_order] of services) {
  await db.execute({
    sql: `INSERT INTO services (id, name, icon, price, duration_min, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, name, icon, price, duration_min, sort_order],
  });
}

// weekday: 0=domingo ... 6=sábado (fechado aos domingos)
const hours = [
  [0, null, null, 1],
  [1, "08:00", "19:00", 0],
  [2, "08:00", "19:00", 0],
  [3, "08:00", "19:00", 0],
  [4, "08:00", "19:00", 0],
  [5, "08:00", "19:00", 0],
  [6, "08:00", "18:00", 0],
];
for (const [weekday, open_time, close_time, closed] of hours) {
  await db.execute({
    sql: `INSERT INTO business_hours (weekday, open_time, close_time, closed)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(weekday) DO NOTHING`,
    args: [weekday, open_time, close_time, closed],
  });
}

console.log("Migração e seed concluídos.");
db.close();
