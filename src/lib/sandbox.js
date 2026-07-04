// Sandbox — "demonun demosu" (AK-020b).
// Sicilin tam zıttı: serbest pratik alanı. Silinebilir, düzenlenebilir sayılmaz,
// HİÇBİR istatistiğe/rütbeye dahil edilmez. Ayrı modül olması bilinçli:
// ledger.js'in "silme fonksiyonu yok" garantisi burada kirlenmesin.
// Depolama: localStorage ak_sandbox_v1.

import { TAGS, SETUPS } from "./ledger.js";

const KEY = "ak_sandbox_v1";

function load() {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(arr) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* dolu */ }
}

// Sicil ile aynı doğrulama — pratik gerçekçi kalsın
export function addSandbox(t) {
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
  };
  const arr = load();
  arr.push(entry);
  save(arr);
  return entry;
}

export function listSandbox() { return load().map(x => ({ ...x })); }

// Sandbox'ta silme SERBEST — burası pratik alanı
export function removeSandbox(id) {
  const arr = load();
  const next = arr.filter(x => x.id !== id);
  save(next);
  return next.length < arr.length;
}
