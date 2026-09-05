/* =========================================================
   HULK BARBEARIA — lógica de agendamento (protótipo)
   ========================================================= */
"use strict";

/* ---------- Dados (fallback caso a API não responda) ---------- */
const DEFAULT_SERVICES = [
  { id: "corte-simples",   icon: "✂️", name: "Corte Simples",  duration: 30, price: 35 },
  { id: "corte-disfarcado",icon: "✂️", name: "Corte Disfarçado", duration: 45, price: 40 },
  { id: "barba",           icon: "🧔", name: "Barba Comum",    duration: 30, price: 25 },
  { id: "corte-barba",     icon: "🔥", name: "Corte + Barba",  duration: 60, price: 60 },
  { id: "barboterapia",    icon: "💈", name: "Barboterapia com vapor de ozônio", duration: 60, price: 80 },
];
const DEFAULT_HOURS = [
  { weekday: 0, open_time: null, close_time: null, closed: 1 },
  { weekday: 1, open_time: "08:00", close_time: "19:00", closed: 0 },
  { weekday: 2, open_time: "08:00", close_time: "19:00", closed: 0 },
  { weekday: 3, open_time: "08:00", close_time: "19:00", closed: 0 },
  { weekday: 4, open_time: "08:00", close_time: "19:00", closed: 0 },
  { weekday: 5, open_time: "08:00", close_time: "19:00", closed: 0 },
  { weekday: 6, open_time: "08:00", close_time: "18:00", closed: 0 },
];

let SERVICES = DEFAULT_SERVICES;
let HOURS = DEFAULT_HOURS;
let BLOCKED = new Set();

const PROS = [
  { id: "luiz",  name: "Luiz Henrique", role: "Especialista em disfarçado", initials: "LH", from: "#5cff6e", to: "#176b29" },
];

/* carrega serviços, horários e dias bloqueados do banco */
async function loadData() {
  try {
    const [services, availability] = await Promise.all([
      fetch("/api/services").then((r) => r.json()),
      fetch("/api/availability").then((r) => r.json()),
    ]);
    if (Array.isArray(services) && services.length) {
      SERVICES = services.map((s) => ({
        id: s.id, icon: s.icon, name: s.name, duration: s.duration_min, price: s.price,
      }));
    }
    if (availability?.hours?.length) HOURS = availability.hours;
    if (availability?.blockedDates) BLOCKED = new Set(availability.blockedDates.map((b) => b.date));
  } catch {
    /* mantém os valores padrão (DEFAULT_SERVICES / DEFAULT_HOURS) */
  }
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoursFor = (date) => HOURS.find((h) => h.weekday === date.getDay());
const isDayOpen = (date) => {
  const h = hoursFor(date);
  return !!h && !h.closed && !BLOCKED.has(ymd(date));
};

/* gera os horários do dia a partir do abre/fecha configurado no admin (passo de 15min) */
function buildSlots(open, close) {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const slots = [];
  let h = oh, m = om;
  while (h < ch || (h === ch && m <= cm)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 15;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}

/* "HH:MM" -> minutos desde meia-noite */
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/* ---------- Estado ---------- */
const state = { service: null, pro: null, date: null, time: null };
let bookingInFlight = false;

/* ---------- Helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MON = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MON_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isPast = (d) => startOfDay(d) < startOfDay(new Date());
const fmtFull = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

/* horários ocupados — consulta os agendamentos reais no banco (intervalos com duração) */
async function busyFor(pro, date) {
  if (!pro || !date) return [];
  try {
    const r = await fetch(`/api/appointments?pro_id=${encodeURIComponent(pro.id)}&date=${ymd(date)}`).then((r) => r.json());
    return r.busy || [];
  } catch {
    /* em caso de falha, apenas não bloqueia nenhum horário além dos já passados */
    return [];
  }
}

/* =========================================================
   RENDER
   ========================================================= */

/* --- Serviços (seção topo) --- */
function renderServiceCards() {
  $("#servicesGrid").innerHTML = SERVICES.map((s) => `
    <button class="service" data-service="${s.id}" role="listitem">
      <span class="service__icon">${escapeHtml(s.icon)}</span>
      <span class="service__body">
        <span class="service__name">${escapeHtml(s.name)}</span>
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
      ${escapeHtml(s.icon)} ${escapeHtml(s.name)} <small>· ${s.duration}min · ${brl(s.price)}</small>
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

/* --- Galeria de cortes --- */
async function renderGallery() {
  const grid = $("#galleryGrid");
  let photos = [];
  try {
    photos = await fetch("/api/gallery").then((r) => r.json());
  } catch {
    /* galeria fica vazia se a API não responder */
  }
  grid.innerHTML = photos.length
    ? photos.map((p) => {
        const caption = p.caption ? `<figcaption class="gallery__caption">${escapeHtml(p.caption)}</figcaption>` : "";
        const media = p.type === "video"
          ? `<video src="${escapeHtml(p.url)}" controls preload="metadata"></video>`
          : p.type === "instagram"
          ? `<iframe class="gallery__embed" src="${escapeHtml(p.url)}" loading="lazy" allow="encrypted-media" allowtransparency="true"></iframe>`
          : `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || "Corte feito na Hulk Barbearia")}" loading="lazy" />`;
        return `<figure class="gallery__item">${media}${caption}</figure>`;
      }).join("")
    : `<p class="gallery__empty">Em breve, fotos dos nossos cortes por aqui.</p>`;
}

/* --- Dias da semana (próximos 5 dias úteis a partir de hoje) --- */
function renderDays() {
  const row = $("#daysRow");
  const today = startOfDay(new Date());
  const days = [];
  let cursor = new Date(today);
  let guard = 0; // evita loop infinito se todos os dias estiverem fechados
  while (days.length < 5 && guard < 60) {
    if (isDayOpen(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
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
async function renderTimes() {
  const grid = $("#timesGrid");
  if (!state.pro || !state.date || !state.service) { grid.innerHTML = ""; return; }
  if (!isDayOpen(state.date)) {
    grid.innerHTML = `<p class="times-empty">Fechado nesse dia.</p>`;
    return;
  }
  const h = hoursFor(state.date);
  const slots = buildSlots(h.open_time, h.close_time);
  const requestedPro = state.pro, requestedDate = state.date;
  const busy = await busyFor(requestedPro, requestedDate);
  // o profissional/data podem ter mudado enquanto a busca estava em andamento
  if (state.pro !== requestedPro || state.date !== requestedDate) return;

  const duration = state.service.duration;
  const closeMin = toMin(h.close_time);
  const isToday = sameDay(state.date, new Date());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  grid.innerHTML = slots.map((slot) => {
    const startMin = toMin(slot);
    const endMin = startMin + duration;
    let off = endMin > closeMin; // o serviço não cabe antes de fechar
    if (!off) off = busy.some((b) => intervalsOverlap(startMin, endMin, toMin(b.time), toMin(b.time) + b.duration));
    if (!off && isToday && startMin <= nowMin) off = true; // horário já passou
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

/* soco do Hulk como confirmação visual */
function hulkPunch(cb) {
  const el = document.createElement("div");
  el.className = "hulk-punch";
  el.innerHTML = "<span>👊</span>";
  document.body.appendChild(el);
  el.querySelector("span").addEventListener("animationend", () => { el.remove(); cb(); }, { once: true });
}

/* confirmação → salva o agendamento no banco (e no Google Calendar) */
async function confirmBooking() {
  const { service, pro, date, time } = state;
  if (!service || !pro || !date || !time || bookingInFlight) return;

  const name = $("#customerName").value.trim();
  const phone = $("#customerPhone").value.replace(/\D/g, "");
  if (!name) { showToast("Informe seu nome."); $("#customerName").focus(); return; }
  if (phone.length < 10) { showToast("Informe um WhatsApp válido com DDD."); $("#customerPhone").focus(); return; }

  bookingInFlight = true;
  $("#confirmBtn").disabled = true;
  try {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: service.id,
        pro_id: pro.id,
        date: ymd(date),
        time,
        customer_name: name,
        customer_phone: phone,
      }),
    });
    if (res.status === 409) {
      showToast("Esse horário acabou de ser reservado. Escolha outro.");
      state.time = null;
      renderTimes();
      return;
    }
    if (res.status === 429) {
      showToast("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
      return;
    }
    if (!res.ok) {
      showToast("Não deu pra confirmar o agendamento. Tente novamente.");
      return;
    }
  } catch {
    showToast("Falha de conexão. Tente novamente.");
    return;
  } finally {
    bookingInFlight = false;
    $("#confirmBtn").disabled = false;
  }

  localStorage.setItem("customerName", name);
  localStorage.setItem("customerPhone", $("#customerPhone").value.trim());

  showToast("Agendamento confirmado!");
  hulkPunch(() => showBookingSuccess(name));
}

/* mensagem "Obrigado pelo agendamento" após o soco do Hulk → some e volta ao topo */
function showBookingSuccess(name) {
  const el = document.createElement("div");
  el.className = "booking-success";
  el.innerHTML = `
    <p class="booking-success__title">Obrigado pelo Agendamento!</p>
    <p class="booking-success__name">${escapeHtml(name)}</p>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 2000);
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
    const disabled = isPast(date) || !isDayOpen(date); // sem passado, sem dia fechado/bloqueado
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

function setupTheme() {
  const btn = $("#themeToggle");
  if (!btn) return;
  const isLight = () => document.documentElement.getAttribute("data-theme") === "light";
  btn.setAttribute("aria-pressed", String(isLight()));
  btn.addEventListener("click", () => {
    const light = !isLight();
    if (light) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    btn.setAttribute("aria-pressed", String(light));
    try { localStorage.setItem("hulk-theme", light ? "light" : "dark"); } catch {}
  });
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
async function init() {
  await loadData();
  renderServiceCards();
  renderServiceChips();
  renderProPicker();
  renderTeam();
  renderGallery();
  renderDays();
  updateSummary();
  setupNav();
  setupTheme();
  setupReveal();
  setupFab();

  const savedName = localStorage.getItem("customerName");
  const savedPhone = localStorage.getItem("customerPhone");
  if (savedName) $("#customerName").value = savedName;
  if (savedPhone) $("#customerPhone").value = savedPhone;

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
