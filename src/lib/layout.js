// Lab layout sistemi (AK-022).
// Varsayılan = "Temel": grafik + sembol + R:R + sonuç. Gerisi Görünüm menüsünden açılır.
// Tercih localStorage'da kalıcı; "Temel" tek tıkla varsayılana döner.

const KEY = "ak_layout_v1";

export const PANELS = [
  { k: "timeline", label: "Zaman çizelgesi" },
  { k: "mc",       label: "Monte Carlo simülasyonu" },
  { k: "risk",     label: "Pozisyon & risk hesaplayıcı" },
  { k: "adv",      label: "Gelişmiş parametreler" },
];

export const BASIC = { timeline: false, mc: false, risk: false, adv: false };

export function loadLayout() {
  if (typeof localStorage === "undefined") return { ...BASIC };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && typeof s === "object" ? { ...BASIC, ...s } : { ...BASIC };
  } catch { return { ...BASIC }; }
}

export function saveLayout(lay) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(lay)); } catch { /* dolu */ }
}
