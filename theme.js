"use strict";
// aplicado o mais cedo possível (script bloqueante no <head>) pra não piscar o tema escuro antes de trocar pro claro salvo
try {
  if (localStorage.getItem("hulk-theme") === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch (e) {}
