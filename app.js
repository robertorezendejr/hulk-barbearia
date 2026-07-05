/* =========================================================
   HULK BARBEARIA — lógica de agendamento (protótipo)
   ========================================================= */
"use strict";

const WHATSAPP = "5522996228571";

/* ---------- Dados ---------- */
const SERVICES = [
  { id: "corte-simples",   icon: "✂️", name: "Corte Simples",  duration: 30, price: 35 },
  { id: "corte-disfarcado",icon: "✂️", name: "Corte Disfarçado", duration: 45, price: 40 },
  { id: "barba",           icon: "🧔", name: "Barba Comum",    duration: 30, price: 25 },
  { id: "corte-barba",     icon: "🔥", name: "Corte + Barba",  duration: 60, price: 60 },
  { id: "barboterapia",    icon: "💈", name: "Barboterapia com vapor de ozônio", duration: 60, price: 80 },
];

const PROS = [
  { id: "luiz",  name: "Luiz Henrique", role: "Especialista em disfarçado", initials: "LH", from: "#5cff6e", to: "#176b29" },
];

/* horários base do dia (08:00 → 18:00, passo de 45min) */
function buildSlots() {
  const slots = [];
  let h = 8, m = 0;
  while (h < 18 || (h === 18 && m === 0)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 45;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}
const SLOTS = buildSlots();

/* ---------- Estado ---------- */
const state = { service: null, pro: null, date: null, time: null };

/* ---------- Helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MON = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MON_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isPast = (d) => startOfDay(d) < startOfDay(new Date());
const fmtFull = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

/* horários ocupados — determinístico por (profissional + data) para parecer real */
function bookedFor(pro, date) {
  if (!pro || !date) return new Set();
  let seed = pro.id.length * 7 + date.getDate() * 13 + date.getMonth() * 31;
  const booked = new Set();
  SLOTS.forEach((slot, i) => {
    seed = (seed * 9301 + 49297) % 233280;
    if ((seed / 233280) < 0.32) booked.add(slot); // ~32% ocupados
  });
  // bloqueia horários já passados se a data for hoje
  if (sameDay(date, new Date())) {
    const now = new Date();
    SLOTS.forEach((slot) => {
      const [h, m] = slot.split(":").map(Number);
      if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) booked.add(slot);
    });
  }
  return booked;
}

/* =========================================================
   RENDER
   ========================================================= */

/* --- Serviços (seção topo) --- */
function renderServiceCards() {
  $("#servicesGrid").innerHTML = SERVICES.map((s) => `
    <button class="service" data-service="${s.id}" role="listitem">
      <span class="service__icon">${s.icon}</span>
      <span class="service__body">
        <span class="service__name">${s.name}</span>
        <span class="service__meta">
          <span>⏱ ${s.duration} min</span>
        </span>
        <span class="service__price">${brl(s.price)}</span>
        <span class="service__pick">Selecionar
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </span>
      </span>
    </button>`).join("");

  $$(".service").forEach((el) =>
    el.addEventListener("click", () => selectService(el.dataset.service, true))
  );
}

/* --- Chips de serviço (dentro do agendamento) --- */
function renderServiceChips() {
  $("#serviceChips").innerHTML = SERVICES.map((s) => `
    <button class="chip" data-chip="${s.id}">
      ${s.icon} ${s.name} <small>· ${s.duration}min · ${brl(s.price)}</small>
    </button>`).join("");

  $$(".chip").forEach((el) =>
    el.addEventListener("click", () => selectService(el.dataset.chip, false))
  );
}

/* --- Profissionais (picker no agendamento) --- */
function renderProPicker() {
  $("#proPicker").innerHTML = PROS.map((p) => `
    <button class="pro" data-pro="${p.id}">
      <span class="pro__avatar" style="background:linear-gradient(135deg, ${p.from}, ${p.to})">${p.initials}</span>
      <span class="pro__name">${p.name}</span>
      <span class="pro__role">${p.role}</span>
    </button>`).join("");

  $$(".pro").forEach((el) =>
    el.addEventListener("click", () => selectPro(el.dataset.pro))
  );
}

/* --- Profissionais (seção institucional) --- */
function renderTeam() {
  $("#teamGrid").innerHTML = PROS.map((p) => `
    <article class="member">
      <div class="member__avatar" style="background:linear-gradient(135deg, ${p.from}, ${p.to})">${p.initials}</div>
      <h3 class="member__name">${p.name}</h3>
      <p class="member__role">${p.role}</p>
      <p class="member__bio">Atendimento de segunda a sábado, com horário marcado.</p>
    </article>`).join("");
}

/* --- Dias da semana (próximos 5 dias úteis a partir de hoje) --- */
function renderDays() {
  const row = $("#daysRow");
  const today = startOfDay(new Date());
  const days = [];
  let cursor = new Date(today);
  while (days.length < 5) {
    if (cursor.getDay() !== 0) days.push(new Date(cursor)); // pula domingo (fechado)
    cursor.setDate(cursor.getDate() + 1);
  }

  row.innerHTML = days.map((d, i) => {
    let label = DOW_SHORT[d.getDay()];
    if (sameDay(d, today)) label = "Hoje";
    else if (sameDay(d, new Date(today.getTime() + 864e5))) label = "Amanhã";
    return `
      <button class="day" data-date="${d.toISOString()}">
        <span class="day__dow">${label}</span>
        <span class="day__num">${String(d.getDate()).padStart(2,"0")}</span>
        <span class="day__mon">${MON_SHORT[d.getMonth()]}</span>
      </button>`;
  }).join("");

  $$(".day").forEach((el) =>
    el.addEventListener("click", () => selectDate(new Date(el.dataset.date), el))
  );
}

/* --- Horários --- */
function renderTimes() {
  const grid = $("#timesGrid");
  if (!state.pro || !state.date) { grid.innerHTML = ""; return; }
  const booked = bookedFor(state.pro, state.date);
  grid.innerHTML = SLOTS.map((slot) => {
    const off = booked.has(slot);
    return `<button class="time" data-time="${slot}" ${off ? "disabled" : ""}>${slot}</button>`;
  }).join("");

  $$(".time:not(:disabled)").forEach((el) =>
    el.addEventListener("click", () => selectTime(el.dataset.time, el))
  );
}

/* =========================================================
   SELEÇÕES / FLUXO
   ========================================================= */
function selectService(id, scroll) {
  state.service = SERVICES.find((s) => s.id === id);
  // reset etapas seguintes
  state.time = null;

  $$(".service").forEach((el) => el.classList.toggle("is-selected", el.dataset.service === id));
  $$(".chip").forEach((el) => el.classList.toggle("is-selected", el.dataset.chip === id));

  unlock(2);
  setStep(2);
  updateSummary();
  if (scroll) document.getElementById("agendamento").scrollIntoView({ behavior: "smooth" });
}

function selectPro(id) {
  state.pro = PROS.find((p) => p.id === id);
  state.time = null;
  $$(".pro").forEach((el) => el.classList.toggle("is-selected", el.dataset.pro === id));
  unlock(3);
  setStep(3);
  renderTimes();
  updateSummary();
}

function selectDate(date, el) {
  state.date = date;
  state.time = null;
  if (el) {
    $$(".day").forEach((d) => d.classList.remove("is-selected"));
    el.classList.add("is-selected");
  } else {
    $$(".day").forEach((d) => d.classList.remove("is-selected")); // veio do modal
  }
  unlock(4);
  setStep(4);
  renderTimes();
  updateSummary();
}

function selectTime(time, el) {
  state.time = time;
  $$(".time").forEach((t) => t.classList.remove("is-selected"));
  el.classList.add("is-selected");
  $("#summary").classList.remove("is-locked");
  $("#confirmBtn").disabled = false;
  setStep(4, true);
  updateSummary();
  $("#summary").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* destrava uma etapa (1..4) */
function unlock(step) {
  for (let i = 2; i <= 4; i++) {
    const node = $(`.bstep[data-bstep="${i}"]`);
    if (i <= step) node.classList.remove("is-locked");
  }
}

/* atualiza a trilha de progresso */
function setStep(step, done = false) {
  $$(".steps__item").forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle("is-active", n === step && !done);
    el.classList.toggle("is-done", n < step || (n === step && done));
  });
}

/* resumo */
function updateSummary() {
  $("#sumService").textContent = state.service ? state.service.name : "—";
  $("#sumPro").textContent     = state.pro ? state.pro.name : "—";
  $("#sumDate").textContent    = state.date ? `${DOW[state.date.getDay()]}, ${fmtFull(state.date)}` : "—";
  $("#sumTime").textContent    = state.time || "—";
  $("#sumPrice").textContent   = state.service ? brl(state.service.price) : "—";
}

/* soco do Hulk antes de abrir o WhatsApp */
function hulkPunch(cb) {
  const el = document.createElement("div");
  el.className = "hulk-punch";
  el.innerHTML = "<span>👊</span>";
  document.body.appendChild(el);
  el.querySelector("span").addEventListener("animationend", () => { el.remove(); cb(); }, { once: true });
}

/* confirmação → WhatsApp */
function confirmBooking() {
  const { service, pro, date, time } = state;
  if (!service || !pro || !date || !time) return;

  const msg =
    `*Novo agendamento — Hulk Barbearia* 💚\n\n` +
    `✂️ *Serviço:* ${service.name}\n` +
    `💈 *Profissional:* ${pro.name}\n` +
    `📅 *Data:* ${DOW[date.getDay()]}, ${fmtFull(date)}\n` +
    `🕐 *Horário:* ${time}\n` +
    `💰 *Valor:* ${brl(service.price)} (${service.duration} min)\n\n` +
    `Confirma pra mim, por favor?`;

  showToast("Agendamento pronto! Abrindo o WhatsApp…");
  hulkPunch(() => {
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  });
}

/* =========================================================
   MODAL CALENDÁRIO ("Outro dia")
   ========================================================= */
const cal = { view: startOfDay(new Date()) };

function openCal() {
  cal.view = startOfDay(state.date || new Date());
  cal.view.setDate(1);
  renderCal();
  const m = $("#calModal");
  m.classList.add("is-open");
  m.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeCal() {
  const m = $("#calModal");
  m.classList.remove("is-open");
  m.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function renderCal() {
  $("#calTitle").textContent = `${MON[cal.view.getMonth()]} ${cal.view.getFullYear()}`;
  const year = cal.view.getFullYear(), month = cal.view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = "";
  for (let i = 0; i < firstDow; i++) html += `<span class="cal__day is-empty"></span>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const disabled = isPast(date) || date.getDay() === 0; // sem passado, sem domingo
    const cls = [
      "cal__day",
      sameDay(date, new Date()) ? "is-today" : "",
      state.date && sameDay(date, state.date) ? "is-selected" : "",
    ].join(" ").trim();
    html += `<button class="${cls}" data-cd="${date.toISOString()}" ${disabled ? "disabled" : ""}>${d}</button>`;
  }
  $("#calGrid").innerHTML = html;

  $$("#calGrid .cal__day:not(:disabled):not(.is-empty)").forEach((el) =>
    el.addEventListener("click", () => {
      selectDate(new Date(el.dataset.cd), null);
      // marca o dia da linha se existir, senão apenas fecha
      const match = $$(".day").find((d) => sameDay(new Date(d.dataset.date), state.date));
      if (match) match.classList.add("is-selected");
      closeCal();
      showToast(`Dia selecionado: ${fmtFull(state.date)}`);
      $("#agendamento").scrollIntoView({ behavior: "smooth" });
    })
  );
}

/* =========================================================
   TOAST
   ========================================================= */
let toastTimer;
function showToast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 3200);
}

/* =========================================================
   UI GERAL (menu, reveal, ano)
   ========================================================= */
function setupNav() {
  const toggle = $("#navToggle"), nav = $("#nav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav__link").forEach((l) => l.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }));
}

function setupReveal() {
  const els = $$(".section, .booking, .member, .service, .amenity");
  els.forEach((el) => el.classList.add("reveal"));
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (!e.isIntersecting) return;
      // stagger: cards irmãos revelam com delay escalonado (0.08s por item)
      const siblings = e.target.parentElement ? [...e.target.parentElement.children] : [];
      const idx = siblings.indexOf(e.target);
      const delay = idx >= 0 ? idx * 80 : 0;
      setTimeout(() => e.target.classList.add("is-in"), delay);
      io.unobserve(e.target);
    });
  }, { threshold: 0.08 });
  els.forEach((el) => io.observe(el));
}

function setupFab() {
  const fab = $("#fab");
  const hero = $(".hero");
  if (!fab || !hero) return;
  const io = new IntersectionObserver(([e]) => {
    fab.classList.toggle("is-visible", !e.isIntersecting);
  }, { threshold: 0.2 });
  io.observe(hero);
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  renderServiceCards();
  renderServiceChips();
  renderProPicker();
  renderTeam();
  renderDays();
  updateSummary();
  setupNav();
  setupReveal();
  setupFab();

  $("#year").textContent = new Date().getFullYear();
  $("#otherDayBtn").addEventListener("click", openCal);
  document.querySelectorAll('a[href^="https://wa.me"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      hulkPunch(() => window.open(a.href, "_blank", "noopener"));
    });
  });
  $("#confirmBtn").addEventListener("click", confirmBooking);
  $("#calPrev").addEventListener("click", () => { cal.view.setMonth(cal.view.getMonth() - 1); renderCal(); });
  $("#calNext").addEventListener("click", () => { cal.view.setMonth(cal.view.getMonth() + 1); renderCal(); });
  $$("#calModal [data-close]").forEach((el) => el.addEventListener("click", closeCal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCal(); });
}

document.addEventListener("DOMContentLoaded", init);
