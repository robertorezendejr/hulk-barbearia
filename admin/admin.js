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
  loadServices();
  loadHours();
  loadBlocked();
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
      ? "Muitas tentativas erradas. Essa conta fica bloqueada por 24 horas."
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
  $("#galleryGrid").innerHTML = photos.map((p) => `
    <div class="gallery-item" data-id="${p.id}">
      <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || "")}" loading="lazy" />
      ${p.caption ? `<span class="gallery-item__caption">${escapeHtml(p.caption)}</span>` : ""}
      <button class="gallery-item__del js-del-photo" type="button" aria-label="Excluir foto">×</button>
    </div>`).join("");

  $$("#galleryGrid .js-del-photo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest(".gallery-item").dataset.id);
      await api("/api/admin/gallery", { method: "DELETE", body: { id } });
      loadGallery();
      showToast("Foto removida.");
    });
  });
}

$("#galleryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const file = form.get("image");
  if (!file || !file.size) return;
  try {
    const image = await fileToDataURL(file);
    await api("/api/admin/gallery", { method: "POST", body: { image, caption: form.get("caption") } });
    e.target.reset();
    loadGallery();
    showToast("Foto enviada.");
  } catch {
    showToast("Não deu pra enviar a foto — confira o tamanho e o formato.");
  }
});

/* ---------- Agendamentos ---------- */
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function loadAppointments() {
  const list = await api("/api/admin/appointments");
  $("#appointmentsBody").innerHTML = list.length
    ? list.map((a) => {
        const [y, m, d] = a.date.split("-");
        return `
      <tr data-id="${a.id}">
        <td>${d}/${m}/${y}</td>
        <td>${escapeHtml(a.time)}</td>
        <td>${escapeHtml(a.customer_name)}</td>
        <td><a href="https://wa.me/55${escapeHtml(a.customer_phone)}" target="_blank" rel="noopener">${escapeHtml(a.customer_phone)}</a></td>
        <td>${escapeHtml(a.service_name)}</td>
        <td>${brl(a.price)}</td>
        <td><button class="btn btn--ghost js-cancel">Cancelar</button></td>
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
}

/* ---------- Serviços ---------- */
async function loadServices() {
  const services = await api("/api/admin/services");
  $("#servicesBody").innerHTML = services.map((s) => `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.icon)} ${escapeHtml(s.name)}</td>
      <td><input type="number" min="0" step="0.01" class="js-price" value="${s.price}" /></td>
      <td><input type="number" min="1" step="1" class="js-duration" value="${s.duration_min}" /></td>
      <td><input type="checkbox" class="js-active" ${s.active ? "checked" : ""} /></td>
      <td><button class="btn btn--ghost js-save">Salvar</button></td>
    </tr>`).join("");

  $$("#servicesBody tr").forEach((row) => {
    row.querySelector(".js-save").addEventListener("click", async () => {
      const id = row.dataset.id;
      const price = Number(row.querySelector(".js-price").value);
      const duration_min = Number(row.querySelector(".js-duration").value);
      const active = row.querySelector(".js-active").checked;
      try {
        await api("/api/admin/services", { method: "PUT", body: { id, price, duration_min, active } });
        showToast("Serviço atualizado.");
      } catch {
        showToast("Não deu pra salvar — confira os valores.");
      }
    });
  });
}

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

checkSession();
