// CSV işlem import'u (AK-025) — bağımlılıksız mini çözücü.
// Beklenen sütunlar (başlık satırı zorunlu, sıra serbest, büyük/küçük harf serbest):
//   sym, dir, plan, r  (zorunlu)   +   tag, setup, d  (opsiyonel)
// dir: Long/Short (l/s, long/short, al/sat kabul edilir)
// tag boşsa "Plana uydu" sayılmaz — "Erken çıkış" da değil; nötr olsun diye "Plana uydu" DEĞİL,
// bilinçli varsayılan: "Plana uydu" (kullanıcı beyanı yoksa cezalandırma) yerine kullanıcı seçer — bkz. Ben UI.
// Sınırlar (bilinçli): tırnaklı alan / alan içi virgül desteklenmez (işlem verisinde gerekmez).

import { TAGS, SETUPS } from "./ledger.js";

const DIRMAP = { long: "Long", l: "Long", al: "Long", buy: "Long", short: "Short", s: "Short", sat: "Short", sell: "Short" };

// Ham CSV -> satır objeleri. Dönen: { rows: [...], errors: ["satır 3: ..."] }
export function parseTradesCSV(text, defaultTag = "Plana uydu") {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["Dosya boş veya başlık satırı yok."] };

  const heads = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase());
  const need = ["sym", "dir", "plan", "r"];
  const missing = need.filter(n => !heads.includes(n));
  if (missing.length) return { rows: [], errors: [`Eksik sütun: ${missing.join(", ")} (başlık satırı: sym,dir,plan,r[,tag,setup,d])`] };

  const idx = Object.fromEntries(heads.map((h, i) => [h, i]));
  const rows = [], errors = [];

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(/[,;]/).map(x => x.trim());
    const sym = (c[idx.sym] || "").toUpperCase();
    const dir = DIRMAP[(c[idx.dir] || "").toLowerCase()];
    const plan = Number(c[idx.plan]);
    const r = Number(c[idx.r]);
    const tag = idx.tag != null && TAGS.includes(c[idx.tag]) ? c[idx.tag] : defaultTag;
    const setup = idx.setup != null && SETUPS.includes(c[idx.setup]) ? c[idx.setup] : "Diğer";
    const d = idx.d != null && c[idx.d] && !isNaN(Date.parse(c[idx.d])) ? new Date(c[idx.d]).toISOString() : null;

    if (!sym) { errors.push(`satır ${i + 1}: sembol boş`); continue; }
    if (!dir) { errors.push(`satır ${i + 1}: yön anlaşılamadı ("${c[idx.dir]}")`); continue; }
    if (!Number.isFinite(plan) || plan <= 0) { errors.push(`satır ${i + 1}: plan geçersiz`); continue; }
    if (!Number.isFinite(r)) { errors.push(`satır ${i + 1}: sonuç R geçersiz`); continue; }
    rows.push({ sym, dir, plan, r, tag, setup, d });
  }
  return { rows, errors };
}

// Mükerrer anahtarı: aynı sembol + aynı R + aynı gün (tarih varsa) — toplu import kazalarına karşı.
export function dedupeKey(t) {
  const day = t.d ? t.d.slice(0, 10) : "?";
  return `${t.sym}|${t.r}|${day}|${t.dir}`;
}
