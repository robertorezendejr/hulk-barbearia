// Servidor para a VPS (Dokploy): serve public/ e roda os handlers de api/ no formato da Vercel.
// ponytail: node:http puro, só os helpers que os handlers usam (status/json/body/query/cookies)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PUBLIC = join(import.meta.dirname, "public");
const MAX_BODY = 60 * 1024 * 1024; // vídeo de 40MB em base64 dentro do JSON
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.public.blob.vercel-storage.com; media-src 'self' https://*.public.blob.vercel-storage.com; frame-src https://www.google.com https://www.instagram.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("too_large"), { code: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function api(req, res, url) {
  const route = url.pathname.slice(5); // tira "/api/"
  if (!/^(admin\/)?[a-z-]+$/.test(route) || route.split("/").pop().startsWith("_")) return res.status(404).json({ error: "not_found" });
  const file = join(import.meta.dirname, "api", `${route}.js`);
  if (!existsSync(file)) return res.status(404).json({ error: "not_found" });

  req.query = Object.fromEntries(url.searchParams);
  req.cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((c) => {
    const i = c.indexOf("=");
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
  const raw = await readBody(req);
  try { req.body = raw && (req.headers["content-type"] || "").includes("json") ? JSON.parse(raw) : raw || undefined; }
  catch { return res.status(400).json({ error: "invalid_json" }); }

  const { default: handler } = await import(file);
  await handler(req, res);
}

async function serveStatic(req, res, url) {
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.includes("..")) return res.status(400).end();
  if (path.endsWith("/")) path += "index.html";
  // cleanUrls da Vercel: /admin → admin/index.html, /pagina → pagina.html
  const candidates = extname(path) ? [path] : [`${path}.html`, `${path}/index.html`];
  for (const p of candidates) {
    try {
      const data = await readFile(join(PUBLIC, p));
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      return res.end(data);
    } catch {}
  }
  res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
}

createServer(async (req, res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(req.method, url.pathname, err);
    if (!res.headersSent) res.status(err.code === 413 ? 413 : 500).json({ error: err.code === 413 ? "too_large" : "server_error" });
  }
}).listen(process.env.PORT || 3000, () => console.log(`ouvindo na porta ${process.env.PORT || 3000}`));
