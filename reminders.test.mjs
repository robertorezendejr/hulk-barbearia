// node --test reminders.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { due, message } from "./reminders.js";

const T = (s) => Date.parse(`${s}:00-03:00`); // "2026-10-07T08:00" no fuso de Brasília
const appt = (time, extra = {}) => ({
  date: "2026-10-07", time, customer_name: "João Silva", customer_phone: "22999999999",
  service_name: "Corte Disfarçado", created_at: T("2026-10-01T10:00"),
  reminder_1_sent: null, reminder_2_sent: null, ...extra,
});

test("08:00 e 08:45 → só 21:00 da véspera", () => {
  for (const t of ["08:00", "08:45"]) {
    assert.equal(due(appt(t), T("2026-10-06T20:59")), null);
    assert.equal(due(appt(t), T("2026-10-06T21:00")), 1);
    assert.equal(due(appt(t, { reminder_1_sent: 1 }), T("2026-10-07T07:30")), null); // sem 2ª (nada às 07:xx)
  }
});

test("09:00 e 09:45 → 21:00 da véspera + 08:00", () => {
  for (const t of ["09:00", "09:45"]) {
    assert.equal(due(appt(t), T("2026-10-06T21:00")), 1);
    assert.equal(due(appt(t, { reminder_1_sent: 1 }), T("2026-10-07T07:59")), null);
    assert.equal(due(appt(t, { reminder_1_sent: 1 }), T("2026-10-07T08:00")), 2);
  }
});

test("10:00 → 08:00 + 09:00; 15:00 → 08:00 + 14:00", () => {
  assert.equal(due(appt("10:00"), T("2026-10-06T21:00")), null); // sem mensagem na véspera
  assert.equal(due(appt("10:00"), T("2026-10-07T08:00")), 1);
  assert.equal(due(appt("10:00", { reminder_1_sent: 1 }), T("2026-10-07T08:30")), null);
  assert.equal(due(appt("10:00", { reminder_1_sent: 1 }), T("2026-10-07T09:00")), 2);
  assert.equal(due(appt("15:00"), T("2026-10-07T08:00")), 1);
  assert.equal(due(appt("15:00", { reminder_1_sent: 1 }), T("2026-10-07T14:00")), 2);
  assert.equal(due(appt("15:00", { reminder_1_sent: 1, reminder_2_sent: 1 }), T("2026-10-07T14:05")), null);
});

test("marcou depois do horário da mensagem → pula essa, recebe a próxima", () => {
  const late = appt("15:00", { created_at: T("2026-10-07T11:00") });
  assert.equal(due(late, T("2026-10-07T11:01")), null);
  assert.equal(due(late, T("2026-10-07T14:00")), 2);
  const night = appt("09:00", { created_at: T("2026-10-06T22:00") });
  assert.equal(due(night, T("2026-10-06T22:01")), null);
  assert.equal(due(night, T("2026-10-07T08:00")), 2);
  assert.equal(due(appt("08:30", { created_at: T("2026-10-07T07:40") }), T("2026-10-07T07:41")), null);
});

test("servidor voltando atrasado", () => {
  assert.equal(due(appt("15:00"), T("2026-10-07T09:30")), 1); // 08:00 atrasada mas antes das 14:00 → ainda vale
  assert.equal(due(appt("15:00"), T("2026-10-07T14:10")), 2); // perdeu a 1ª → manda só a 2ª
  assert.equal(due(appt("08:00"), T("2026-10-07T08:05")), null); // horário já passou
  assert.equal(due(appt("15:00", { reminder_1_sent: 1 }), T("2026-10-07T15:01")), null);
});

test("texto e link", () => {
  const m = message(appt("15:00"), T("2026-10-07T08:00"));
  assert.equal(m, "João Silva, você tem um Corte Disfarçado no dia 07/10 às 15:00 na Barbearia do Hulk 👊\n\n" +
    "Precisa desmarcar? https://hulkbarbearia.com.br/?meus=22999999999");
  assert.match(message(appt("15:00"), T("2026-10-07T14:00")), /Fale com a barbearia/); // 1h antes: prazo fechou
  assert.match(message(appt("09:00"), T("2026-10-07T08:00")), /Fale com a barbearia/);
  assert.match(message(appt("09:15"), T("2026-10-07T08:00")), /\?meus=/); // 1h15 antes: ainda dá
  assert.match(message(appt("08:00"), T("2026-10-06T21:00")), /\?meus=/);
});
