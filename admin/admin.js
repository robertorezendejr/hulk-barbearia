"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

let toastTimer;
function showToast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { showLogin(); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "request_failed");
  return data;
}

/* ---------- Login / Sessão ---------- */
function showLogin() {
  $("#loginView").hidden = false;
  $("#dashboardView").hidden = true;
  $("#logoutBtn").hidden = true;
}
function showDashboard() {
  $("#loginView").hidden = true;
  $("#dashboardView").hidden = false;
  $("#logoutBtn").hidden = false;
  loadGallery();
  loadAppointments();
  loadRecurring();
  loadServices();
  loadHours();
  loadBlocked();
  loadBlockedCustomers();
  loadAdmins();
}

async function checkSession() {
  const { authed } = await fetch("/api/admin/auth").then((r) => r.json());
  authed ? showDashboard() : showLogin();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const errEl = $("#loginError");
  errEl.hidden = true;
  try {
    await api("/api/admin/auth", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message === "too_many_attempts"
      ? "Muitas tentativas erradas. Essa conta fica bloqueada por 6 horas."
      : "E-mail ou senha incorretos.";
    errEl.hidden = false;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/admin/auth", { method: "DELETE" });
  showLogin();
});

/* ---------- Galeria ---------- */
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadGallery() {
  const photos = await api("/api/admin/gallery");
  $("#galleryGrid").innerHTML = photos.map((p) => {
    const media = p.type === "video"
      ? `<video src="${escapeHtml(p.url)}" controls preload="metadata"></video>`
      : p.type === "instagram"
      ? `<iframe src="${escapeHtml(p.url)}" loading="lazy" allow="encrypted-media" allowtransparency="true"></iframe>`
      : `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || "")}" loading="lazy" />`;
    return `
    <div class="gallery-item" data-id="${p.id}">
      ${media}
      ${p.caption ? `<span class="gallery-item__caption">${escapeHtml(p.caption)}</span>` : ""}
      <button class="gallery-item__del js-del-photo" type="button" aria-label="Excluir">×</button>
    </div>`;
  }).join("");

  $$("#galleryGrid .js-del-photo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest(".gallery-item").dataset.id);
      btn.disabled = true;
      btn.textContent = "…";
      try {
        await api("/api/admin/gallery", { method: "DELETE", body: { id } });
        loadGallery();
        showToast("Removido da galeria.");
      } catch {
        showToast("Não deu pra remover.");
        btn.disabled = false;
        btn.textContent = "×";
      }
    });
  });
}

$("#galleryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const caption = form.get("caption");
  const instagramUrl = form.get("instagram_url");
  const file = form.get("file");
  const submitBtn = e.target.querySelector("button[type=submit]");
  const progress = $("#galleryProgress");
  submitBtn.disabled = true;
  progress.value = 50;
  progress.hidden = false;
  // ponytail: progresso simulado (upload real termina rápido demais pra reportar frações úteis) —
  // sobe sozinho até 90% e só bate 100% quando o item realmente aparece na galeria
  const tick = setInterval(() => { if (progress.value < 90) progress.value += 4; }, 200);
  try {
    const body = { caption };
    if (instagramUrl) {
      body.instagram_url = instagramUrl;
    } else if (file && file.size) {
      body[file.type.startsWith("video/") ? "video" : "image"] = await fileToDataURL(file);
    } else {
      showToast("Escolha um arquivo ou cole um link do Instagram.");
      return;
    }
    await api("/api/admin/gallery", { method: "POST", body });
    e.target.reset();
    await loadGallery();
    progress.value = 100;
    showToast("Adicionado à galeria.");
  } catch {
    showToast("Não deu pra enviar — confira o arquivo/link.");
  } finally {
    clearInterval(tick);
    submitBtn.disabled = false;
    setTimeout(() => { progress.hidden = true; progress.value = 0; }, 300);
  }
});

/* ---------- Agendamentos ---------- */
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// telefone já pode vir com ou sem o "55" (depende do que o cliente digitou) — 10-11 dígitos = sem DDI, 12-13 = já tem
const waNumber = (phone) => (phone.length >= 12 ? phone : `55${phone}`);

// (22) 99999-9999 — só pra exibir
const fmtPhone = (p) => p.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

async function loadAppointments() {
  const [list, { customers }] = await Promise.all([api("/api/admin/appointments"), api("/api/admin/blocked")]);
  const blockedPhones = new Set(customers.map((c) => c.phone));
  $("#appointmentsBody").innerHTML = list.length
    ? list.map((a) => {
        const [y, m, d] = a.date.split("-");
        const isBlocked = blockedPhones.has(a.customer_phone);
        return `
      <tr data-id="${a.id}" data-phone="${escapeHtml(a.customer_phone)}" data-name="${escapeHtml(a.customer_name)}">
        <td>${d}/${m}/${y}</td>
        <td>${escapeHtml(a.time)}</td>
        <td>${isBlocked ? `<span class="badge-blocked">🚫 Bloqueado</span>` : ""}${escapeHtml(a.customer_name)}</td>
        <td><a href="https://wa.me/${waNumber(a.customer_phone)}" target="_blank" rel="noopener">${escapeHtml(a.customer_phone)}</a></td>
        <td>${escapeHtml(a.service_name)}</td>
        <td>${brl(a.price)}</td>
        <td>
          <button class="btn btn--ghost js-cancel">Cancelar</button>
          ${isBlocked ? "" : `<button class="btn btn--ghost btn--danger-ghost js-block-customer">🚫 Bloquear</button>`}
        </td>
      </tr>`;
      }).join("")
    : `<tr><td colspan="7">Nenhum agendamento futuro.</td></tr>`;

  $$("#appointmentsBody .js-cancel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest("tr").dataset.id);
      await api("/api/admin/appointments", { method: "PUT", body: { id, status: "cancelled" } });
      loadAppointments();
      showToast("Agendamento cancelado.");
    });
  });

  $$("#appointmentsBody .js-block-customer").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      blockCustomer({ phone: tr.dataset.phone, name: tr.dataset.name });
    });
  });
}

/* ---------- Clientes fixos ---------- */
async function loadRecurring() {
  const [{ recurring, exceptions }, services] = await Promise.all([
    api("/api/admin/recurring"),
    api("/api/admin/services"),
  ]);

  const select = $("#recurringServiceSelect");
  select.innerHTML = services
    .filter((s) => s.active)
    .map((s) => `<option value="${s.id}">${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`)
    .join("");

  const serviceOptions = (activeServices, selectedId) => activeServices
    .map((s) => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`)
    .join("");
  const activeServices = services.filter((s) => s.active);

  $("#recurringBody").innerHTML = recurring.length
    ? recurring.map((r) => `
      <tr data-id="${r.id}">
        <td>${DOW[r.weekday]}</td>
        <td>${escapeHtml(r.time)}</td>
        <td><input type="text" class="js-edit-name" value="${escapeHtml(r.customer_name)}" /></td>
        <td><input type="tel" class="js-edit-phone" value="${escapeHtml(r.customer_phone)}" /></td>
        <td><select class="js-edit-service">${serviceOptions(activeServices, r.service_id)}</select></td>
        <td><input type="date" class="js-except-date" /></td>
        <td>
          <button class="btn btn--ghost js-save" type="button">Salvar</button>
          <button class="btn btn--ghost js-except" type="button">Desmarcar</button>
          <button class="btn btn--ghost js-remove" type="button">Remover</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="7">Nenhum cliente fixo cadastrado.</td></tr>`;

  $$("#recurringBody .js-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = Number(row.dataset.id);
      const customer_name = row.querySelector(".js-edit-name").value;
      const customer_phone = row.querySelector(".js-edit-phone").value;
      const service_id = row.querySelector(".js-edit-service").value;
      try {
        await api("/api/admin/recurring", { method: "PUT", body: { id, customer_name, customer_phone, service_id } });
        loadRecurring();
        showToast("Cliente fixo atualizado.");
      } catch {
        showToast("Não deu pra salvar — confira os dados.");
      }
    });
  });

  $$("#recurringBody .js-except").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const date = row.querySelector(".js-except-date").value;
      if (!date) return showToast("Escolha a data que o cliente vai faltar.");
      const id = Number(row.dataset.id);
      await api("/api/admin/recurring", { method: "PUT", body: { id, date, cancel: true } });
      loadRecurring();
      showToast("Horário desmarcado nessa data.");
    });
  });

  $$("#recurringBody .js-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest("tr").dataset.id);
      await api("/api/admin/recurring", { method: "DELETE", body: { id } });
      loadRecurring();
      showToast("Cliente fixo removido.");
    });
  });

  const byId = new Map(recurring.map((r) => [r.id, r]));
  $("#recurringExceptionsList").innerHTML = exceptions.length
    ? exceptions.map((e) => {
        const r = byId.get(e.recurring_id);
        const [y, m, d] = e.date.split("-");
        return `
      <li data-id="${e.recurring_id}" data-date="${escapeHtml(e.date)}">
        <span>${d}/${m}/${y} — ${r ? escapeHtml(r.customer_name) : "cliente fixo removido"} não vem</span>
        <button class="btn btn--ghost js-undo-except">Desfazer</button>
      </li>`;
      }).join("")
    : `<li><span class="admin-list__reason">Nenhuma falta agendada.</span></li>`;

  $$("#recurringExceptionsList .js-undo-except").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const li = btn.closest("li");
      await api("/api/admin/recurring", {
        method: "PUT",
        body: { id: Number(li.dataset.id), date: li.dataset.date, cancel: false },
      });
      loadRecurring();
      showToast("Desmarcação desfeita.");
    });
  });
}

$("#recurringForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api("/api/admin/recurring", {
      method: "POST",
      body: {
        pro_id: "luiz",
        weekday: Number(form.get("weekday")),
        time: form.get("time"),
        service_id: form.get("service_id"),
        customer_name: form.get("customer_name"),
        customer_phone: form.get("customer_phone"),
      },
    });
    e.target.reset();
    loadRecurring();
    showToast("Cliente fixo adicionado.");
  } catch (err) {
    showToast(err.message === "slot_taken" ? "Já existe um cliente fixo nesse dia/horário." : "Não deu pra adicionar — confira os dados.");
  }
});

/* ---------- Serviços ---------- */
async function loadServices() {
  const services = await api("/api/admin/services");
  $("#servicesBody").innerHTML = services.map((s) => `
    <tr data-id="${s.id}">
      <td><input type="text" class="js-icon" value="${escapeHtml(s.icon)}" maxlength="16" size="4" /></td>
      <td><input type="text" class="js-name" value="${escapeHtml(s.name)}" maxlength="80" /></td>
      <td><input type="number" min="0" step="0.01" class="js-price" value="${s.price}" /></td>
      <td><input type="number" min="1" step="1" class="js-duration" value="${s.duration_min}" /></td>
      <td><input type="checkbox" class="js-active" ${s.active ? "checked" : ""} /></td>
      <td><button class="btn btn--ghost js-save">Salvar</button></td>
    </tr>`).join("");

  $$("#servicesBody tr").forEach((row) => {
    row.querySelector(".js-save").addEventListener("click", async () => {
      const id = row.dataset.id;
      const icon = row.querySelector(".js-icon").value;
      const name = row.querySelector(".js-name").value;
      const price = Number(row.querySelector(".js-price").value);
      const duration_min = Number(row.querySelector(".js-duration").value);
      const active = row.querySelector(".js-active").checked;
      try {
        await api("/api/admin/services", { method: "PUT", body: { id, icon, name, price, duration_min, active } });
        loadRecurring();
        showToast("Serviço atualizado.");
      } catch {
        showToast("Não deu pra salvar — confira os valores.");
      }
    });
  });
}

$("#serviceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api("/api/admin/services", {
      method: "POST",
      body: {
        icon: form.get("icon"),
        name: form.get("name"),
        price: Number(form.get("price")),
        duration_min: Number(form.get("duration_min")),
      },
    });
    e.target.reset();
    loadServices();
    loadRecurring();
    showToast("Serviço adicionado.");
  } catch {
    showToast("Não deu pra adicionar — confira os dados.");
  }
});

/* ---------- Horário de funcionamento ---------- */
async function loadHours() {
  const hours = await api("/api/admin/hours");
  $("#hoursBody").innerHTML = hours.map((h) => `
    <tr data-weekday="${h.weekday}">
      <td>${DOW[h.weekday]}</td>
      <td><input type="checkbox" class="js-closed" ${h.closed ? "checked" : ""} /></td>
      <td><input type="time" class="js-open" value="${h.open_time || ""}" /></td>
      <td><input type="time" class="js-close" value="${h.close_time || ""}" /></td>
      <td><button class="btn btn--ghost js-save">Salvar</button></td>
    </tr>`).join("");

  $$("#hoursBody tr").forEach((row) => {
    row.querySelector(".js-save").addEventListener("click", async () => {
      const weekday = Number(row.dataset.weekday);
      const closed = row.querySelector(".js-closed").checked;
      const open_time = row.querySelector(".js-open").value;
      const close_time = row.querySelector(".js-close").value;
      try {
        await api("/api/admin/hours", { method: "PUT", body: { weekday, closed, open_time, close_time } });
        showToast("Horário atualizado.");
      } catch {
        showToast("Não deu pra salvar o horário.");
      }
    });
  });
}

/* ---------- Dias e horários bloqueados ---------- */
async function loadBlocked() {
  const { dates, slots } = await api("/api/admin/blocked");

  $("#blockedList").innerHTML = dates.length
    ? dates.map((d) => `
      <li data-date="${escapeHtml(d.date)}">
        <span>${escapeHtml(d.date)}${d.reason ? ` <span class="admin-list__reason">· ${escapeHtml(d.reason)}</span>` : ""}</span>
        <button class="btn btn--ghost js-unblock">Desbloquear</button>
      </li>`).join("")
    : `<li><span class="admin-list__reason">Nenhum dia bloqueado.</span></li>`;

  $$("#blockedList .js-unblock").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const date = btn.closest("li").dataset.date;
      await api("/api/admin/blocked", { method: "DELETE", body: { date } });
      loadBlocked();
      showToast("Dia desbloqueado.");
    });
  });

  $("#blockedSlotsList").innerHTML = slots.length
    ? slots.map((s) => {
        const [y, m, d] = s.date.split("-");
        return `
      <li data-date="${escapeHtml(s.date)}" data-time="${escapeHtml(s.time)}">
        <span>${d}/${m}/${y} às ${escapeHtml(s.time)}${s.reason ? ` <span class="admin-list__reason">· ${escapeHtml(s.reason)}</span>` : ""}</span>
        <button class="btn btn--ghost js-unblock-slot">Desbloquear</button>
      </li>`;
      }).join("")
    : `<li><span class="admin-list__reason">Nenhum horário bloqueado.</span></li>`;

  $$("#blockedSlotsList .js-unblock-slot").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const li = btn.closest("li");
      await api("/api/admin/blocked", { method: "DELETE", body: { date: li.dataset.date, time: li.dataset.time } });
      loadBlocked();
      showToast("Horário desbloqueado.");
    });
  });
}

$("#blockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api("/api/admin/blocked", {
      method: "POST",
      body: { date: form.get("date"), reason: form.get("reason") },
    });
    e.target.reset();
    loadBlocked();
    showToast("Dia bloqueado.");
  } catch {
    showToast("Não deu pra bloquear esse dia.");
  }
});

$("#blockSlotForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api("/api/admin/blocked", {
      method: "POST",
      body: { date: form.get("date"), time: form.get("time"), reason: form.get("reason") },
    });
    e.target.reset();
    loadBlocked();
    showToast("Horário bloqueado.");
  } catch {
    showToast("Não deu pra bloquear esse horário.");
  }
});

/* ---------- Clientes bloqueados ---------- */
async function blockCustomer({ phone, name, reason }) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!/^\d{10,11}$/.test(digits)) { showToast("Informe um WhatsApp válido com DDD."); return false; }
  const who = name ? `${name} (${fmtPhone(digits)})` : fmtPhone(digits);
  if (!confirm(`Bloquear ${who}?\n\nEsse cliente não vai mais conseguir agendar pelo site.`)) return false;
  try {
    await api("/api/admin/blocked", { method: "POST", body: { phone: digits, name, reason } });
    loadBlockedCustomers();
    loadAppointments();
    showToast("Cliente bloqueado.");
    return true;
  } catch {
    showToast("Não deu pra bloquear esse cliente.");
    return false;
  }
}

async function loadBlockedCustomers() {
  const { customers } = await api("/api/admin/blocked");
  $("#blockedCustomersList").innerHTML = customers.length
    ? customers.map((c) => `
      <li data-phone="${escapeHtml(c.phone)}">
        <span>
          <span class="badge-blocked">🚫 Bloqueado</span>
          <strong>${escapeHtml(fmtPhone(c.phone))}</strong>${c.name ? ` · ${escapeHtml(c.name)}` : ""}
          <span class="admin-list__reason">${c.reason ? ` · ${escapeHtml(c.reason)}` : ""} · desde ${new Date(Number(c.created_at)).toLocaleDateString("pt-BR")}</span>
        </span>
        <button class="btn btn--ghost js-unblock-customer">Desbloquear</button>
      </li>`).join("")
    : `<li><span class="admin-list__reason">Nenhum cliente bloqueado.</span></li>`;

  $$("#blockedCustomersList .js-unblock-customer").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const phone = btn.closest("li").dataset.phone;
      if (!confirm(`Desbloquear ${fmtPhone(phone)}? Ele volta a poder agendar pelo site.`)) return;
      await api("/api/admin/blocked", { method: "DELETE", body: { phone } });
      loadBlockedCustomers();
      loadAppointments();
      showToast("Cliente desbloqueado.");
    });
  });
}

$("#blockCustomerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const ok = await blockCustomer({ phone: form.get("phone"), name: form.get("name").trim(), reason: form.get("reason").trim() });
  if (ok) e.target.reset();
});

/* ---------- Administradores ---------- */
async function loadAdmins() {
  const admins = await api("/api/admin/admins");
  $("#adminsList").innerHTML = admins.map((a) => `
    <li data-id="${a.id}">
      <span>${escapeHtml(a.email)}</span>
      <button class="btn btn--ghost js-del-admin" ${admins.length <= 1 ? "disabled" : ""}>Excluir</button>
    </li>`).join("");

  $$("#adminsList .js-del-admin").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest("li").dataset.id);
      try {
        await api("/api/admin/admins", { method: "DELETE", body: { id } });
        loadAdmins();
        showToast("Admin removido.");
      } catch {
        showToast("Não deu pra remover esse admin.");
      }
    });
  });
}

$("#adminForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api("/api/admin/admins", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });
    e.target.reset();
    loadAdmins();
    showToast("Admin criado.");
  } catch (err) {
    showToast(err.message === "email_taken" ? "Esse e-mail já é admin." : "Não deu pra criar o admin.");
  }
});

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

setupTheme();
checkSession();
