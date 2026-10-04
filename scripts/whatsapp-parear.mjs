// Gera o código de pareamento do WhatsApp do Luiz (vale ~1 min) e espera conectar.
// Uso, com o Luiz na linha: node --env-file=.env.local scripts/whatsapp-parear.mjs
// Ele digita em: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone
const NUMBER = "5522996228571";
const { EVOLUTION_URL: U, EVOLUTION_API_KEY: KEY, EVOLUTION_INSTANCE: INST = "hulk" } = process.env;
const H = { apikey: KEY };

const state = async () => (await (await fetch(`${U}/instance/connectionState/${INST}`, { headers: H })).json()).instance?.state;

if ((await state()) === "open") { console.log("Já está conectado."); process.exit(0); }

const r = await fetch(`${U}/instance/connect/${INST}?number=${NUMBER}`, { headers: H });
const { pairingCode } = await r.json();
if (!pairingCode) { console.error("Não veio código. Resposta:", r.status); process.exit(1); }
console.log(`\n  CÓDIGO: ${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}\n`);

for (let i = 0; i < 40; i++) {
  await new Promise((ok) => setTimeout(ok, 3000));
  if ((await state()) === "open") { console.log("✅ Conectado!"); process.exit(0); }
}
console.log("Não conectou em 2 min. Rode de novo para gerar outro código.");
