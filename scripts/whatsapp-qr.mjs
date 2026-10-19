// QR code do WhatsApp do Luiz numa página local que se atualiza sozinha (o QR muda a cada ~20 s).
// Uso: node --env-file=.env.local scripts/whatsapp-qr.mjs → abrir http://localhost:3999
// Ele escaneia em: WhatsApp → Aparelhos conectados → Conectar aparelho
import { createServer } from "node:http";
const { EVOLUTION_URL: U, EVOLUTION_API_KEY: KEY, EVOLUTION_INSTANCE: INST = "hulk" } = process.env;
const get = async (path) => (await fetch(`${U}${path}`, { headers: { apikey: KEY } })).json();

const page = `<!doctype html><meta charset="utf-8"><title>WhatsApp Hulk</title>
<body style="font:20px system-ui;text-align:center;padding:24px;background:#fff">
<h2 id="s">Carregando…</h2><img id="q" style="width:360px;image-rendering:pixelated">
<script>
setInterval(async () => {
  const j = await (await fetch("/qr")).json();
  s.textContent = j.open ? "✅ Conectado! Pode fechar." : "Escaneie: WhatsApp → Aparelhos conectados → Conectar aparelho";
  q.style.display = j.open ? "none" : "";
  if (j.base64) q.src = j.base64;
}, 3000);
</script>`;

// tentativa que falhou deixa a instância "suja": recria limpa ao ligar (menos se já estiver conectada)
if ((await get(`/instance/connectionState/${INST}`)).instance?.state !== "open") {
  const h = { apikey: KEY, "content-type": "application/json" };
  await fetch(`${U}/instance/delete/${INST}`, { method: "DELETE", headers: h });
  await new Promise((ok) => setTimeout(ok, 3000));
  await fetch(`${U}/instance/create`, { method: "POST", headers: h, body: JSON.stringify({ instanceName: INST, integration: "WHATSAPP-BAILEYS", qrcode: false, groupsIgnore: true }) });
}

createServer(async (req, res) => {
  if (req.url !== "/qr") return res.end(page);
  const open = (await get(`/instance/connectionState/${INST}`)).instance?.state === "open";
  // enquanto "connecting", o connect só devolve o QR atual (não cria outro socket)
  const { base64 } = open ? {} : await get(`/instance/connect/${INST}`);
  if (open) console.log("✅ Conectado!");
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ open, base64 }));
}).listen(3999, () => console.log("Abra http://localhost:3999"));
