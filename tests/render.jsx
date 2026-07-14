// SSR duman testi (AK-041): her sayfa server-side render edilir.
// Build'in yakalayamadığı çalışma-anı hatalarını (undefined değişken vb.) yakalar.
// "futureSlots is not defined" beyaz ekran vakası bunun doğuşudur.
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Home from "../src/pages/Home.jsx";
import Lab from "../src/pages/Lab.jsx";
import Izleme from "../src/pages/Izleme.jsx";
import Tarama from "../src/pages/Tarama.jsx";
import Ben from "../src/pages/Ben.jsx";
import Topluluk from "../src/pages/Topluluk.jsx";
import Giris from "../src/pages/Giris.jsx";
import Profil from "../src/pages/Profil.jsx";
import Haberler from "../src/pages/Haberler.jsx";
import Ogren from "../src/pages/Ogren.jsx";
import Fiyatlandirma from "../src/pages/Fiyatlandirma.jsx";
import KodEditoru from "../src/pages/KodEditoru.jsx";

const PAGES = [["Home", Home], ["Lab", Lab], ["Izleme", Izleme], ["Tarama", Tarama], ["Ben", Ben], ["Topluluk", Topluluk], ["Giris", Giris], ["Profil", Profil], ["Haberler", Haberler], ["Ogren", Ogren], ["Fiyatlandirma", Fiyatlandirma], ["KodEditoru", KodEditoru]];

let fail = 0;
console.log("sayfa render (SSR duman testi)");
for (const [name, C] of PAGES) {
  try {
    const html = renderToString(<MemoryRouter><C /></MemoryRouter>);
    if (!html || html.length < 50) throw new Error("boş çıktı");
    console.log("  ✓", name);
  } catch (e) {
    fail++;
    console.error("  ✗", name, "—", e.message);
  }
}
if (fail) { console.error(`\n${fail} sayfa render EDİLEMEDİ`); process.exit(1); }
console.log(`\n${PAGES.length} sayfa render OK`);
