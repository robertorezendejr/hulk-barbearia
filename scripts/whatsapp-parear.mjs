// Mostra o código de pareamento do WhatsApp do Luiz e espera conectar.
// O código MUDA a cada ~20-40 s: o script imprime o novo sempre que muda; ele digita o último que aparecer.
// Uso, com o Luiz na linha: node --env-file=.env.local scripts/whatsapp-parear.mjs
// Ele digita em: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone
const NUMBER = "5522996228571";
const { EVOLUTION_URL: U, EVOLUTION_API_KEY: KEY, EVOLUTION_INSTANCE: INST = "hulk" } = process.env;
const H = { apikey: KEY };
const get = async (path) => (await fetch(`${U}${path}`, { headers: H })).json();

let last;
for (let i = 0; i < 100; i++) {
  if ((await get(`/instance/connectionState/${INST}`)).instance?.state === "open") { console.log("✅ Conectado!"); process.exit(0); }
  // enquanto "connecting", o connect só devolve o código atual (não cria outro socket)
  const { pairingCode } = await get(`/instance/connect/${INST}?number=${NUMBER}`);
  if (pairingCode && pairingCode !== last) {
    last = pairingCode;
    console.log(`${new Date().toLocaleTimeString("pt-BR")}  CÓDIGO: ${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`);
  }
  await new Promise((ok) => setTimeout(ok, 2000));
}
console.log("Não conectou em ~3 min. Rode de novo.");
