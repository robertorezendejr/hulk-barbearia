import { createClient } from "@libsql/client";

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
`);

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
