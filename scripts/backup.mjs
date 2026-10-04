// Backup completo: todas as tabelas do Turso (JSON + SQL) e os arquivos da galeria (Vercel Blob).
// Uso: node --env-file=.env.local scripts/backup.mjs  → gera backups/AAAA-MM-DD_HHMM/
import { createClient } from "@libsql/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const stamp = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
const dir = join("backups", stamp);
await mkdir(join(dir, "media"), { recursive: true });

const sqlLit = (v) => (v === null ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const schema = await db.execute("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'");
let dump = "PRAGMA foreign_keys=OFF;\nBEGIN;\n";
for (const s of schema.rows.filter((r) => r.type === "table")) dump += `${s.sql};\n`;
const all = {};
for (const { name } of schema.rows.filter((r) => r.type === "table")) {
  const r = await db.execute(`SELECT * FROM "${name}"`);
  all[name] = r.rows;
  for (const row of r.rows) {
    dump += `INSERT INTO "${name}" (${r.columns.map((c) => `"${c}"`).join(",")}) VALUES (${r.columns.map((c) => sqlLit(row[c])).join(",")});\n`;
  }
  console.log(`${name}: ${r.rows.length} linhas`);
}
for (const s of schema.rows.filter((r) => r.type === "index")) dump += `${s.sql};\n`;
dump += "COMMIT;\n";
await writeFile(join(dir, "banco.sql"), dump);
await writeFile(join(dir, "banco.json"), JSON.stringify(all, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));

// baixa só o que é arquivo nosso (Blob); embeds do Instagram são só links
let n = 0;
for (const p of all.gallery_photos || []) {
  if (p.type === "instagram") continue;
  const res = await fetch(p.url);
  if (!res.ok) { console.error(`FALHOU ${p.url}: ${res.status}`); continue; }
  await writeFile(join(dir, "media", new URL(p.url).pathname.split("/").pop()), Buffer.from(await res.arrayBuffer()));
  n++;
}
console.log(`mídias baixadas: ${n}\nbackup em ${dir}`);
db.close();
