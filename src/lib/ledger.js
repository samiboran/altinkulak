// Sicil — append-only işlem defteri (AK-020).
// TASARIM İLKESİ: Bu modülde silme/düzenleme fonksiyonu BİLEREK YOKTUR.
// Sicile yazılan işlem kalıcıdır; dürüstlük katmanının kullanıcıya uygulanmış hali.
// Depolama: localStorage ak_ledger_v1 (AK-006 auth sonrası Supabase'e taşınır).

const KEY = "ak_ledger_v1";

export const TAGS = ["Plana uydu", "Erken çıkış", "FOMO", "İntikam"];
export const SETUPS = ["FVG", "FVG+BOS", "FVG+OB", "Order Block", "BOS", "Diğer"];

function load() {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(arr) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* dolu */ }
}

// Yeni kayıt ekle. Doğrulama başarısızsa null döner (sessiz bozulma yok).
// t: { sym, setup, dir: "Long"|"Short", plan: number(>0), r: number, tag }
export function addTrade(t) {
  const sym = String(t.sym || "").trim().toUpperCase();
  const plan = Number(t.plan), r = Number(t.r);
  if (!sym || !["Long", "Short"].includes(t.dir)) return null;
  if (!Number.isFinite(plan) || plan <= 0 || !Number.isFinite(r)) return null;
  if (!TAGS.includes(t.tag)) return null;
  const entry = {
    id: Date.now(),
    d: new Date().toISOString(),
    sym,
    setup: SETUPS.includes(t.setup) ? t.setup : "Diğer",
    dir: t.dir,
    plan: Math.round(plan * 10) / 10,
    r: Math.round(r * 10) / 10,
    tag: t.tag,
    rule: t.tag === "Plana uydu",
  };
  const arr = load();
  arr.push(entry);
  save(arr);
  return entry;
}

// Tüm kayıtlar (eskiden yeniye). Kopyasını döner — dışarıdan mutasyon sicili değiştirmez.
export function listTrades() { return load().map(x => ({ ...x })); }

// Özet metrikler — disiplin paneli buradan beslenir.
export function summary(trades = listTrades()) {
  const n = trades.length;
  if (!n) return { n: 0, totalR: 0, adherence: null, avgPlan: null, avgRealWin: null, bestSym: null };
  const totalR = Math.round(trades.reduce((a, t) => a + t.r, 0) * 10) / 10;
  const adherence = Math.round(trades.filter(t => t.rule).length / n * 100);
  const avgPlan = trades.reduce((a, t) => a + t.plan, 0) / n;
  const wins = trades.filter(t => t.r > 0);
  const avgRealWin = wins.length ? wins.reduce((a, t) => a + t.r, 0) / wins.length : 0;
  const bySym = {};
  for (const t of trades) bySym[t.sym] = (bySym[t.sym] || 0) + t.r;
  const bestSym = Object.entries(bySym).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { n, totalR, adherence, avgPlan, avgRealWin, bestSym };
}
