// Rütbe motoru (AK-019).
// İLKE: Rütbe kazanç oranından DEĞİL, sınırlandırılmış R birikimi + istatistikten gelir.
// Anti-gaming:
//  - İşlem başına sayılan katkı ±2R ile sınırlı (tek kumar işlemiyle rütbe atlanamaz)
//  - n < 30 işlem → rütbe yok ("Aday")
//  - Aynı sembolde 5 dk içinde ardışık işlem → yalnız ilki sayılır (spam)
//  - En üst rütbe t ≥ 2 ister (edge istatistiksel olarak kanıtlı olmalı)

import { tStat } from "./stats.js";

const CAP = 2;                 // işlem başına sayılan max |R|
const SPAM_MS = 5 * 60 * 1000; // aynı sembolde 5 dk

export const EDGE_RANKS = [
  { name: "Aday",      minN: 0,   minR: -Infinity, needT: false },
  { name: "Çırak",     minN: 30,  minR: -Infinity, needT: false },
  { name: "Kalfa",     minN: 30,  minR: 10,        needT: false },
  { name: "Usta",      minN: 60,  minR: 30,        needT: false },
  { name: "Büyükusta", minN: 100, minR: 60,        needT: true  },
];

export const CONTRIB_RANKS = [
  { name: "Gözlemci",  minP: 0 },
  { name: "Katkıcı",   minP: 10 },
  { name: "Eğitimci",  minP: 40 },
  { name: "Öğretmen",  minP: 100 },
  { name: "Profesör",  minP: 250 },
];

// Spam filtresi: aynı sembolde SPAM_MS içindeki ardışık kayıtlardan yalnız ilki sayılır
export function countable(trades) {
  const lastBySym = {};
  const out = [];
  for (const t of [...trades].sort((a, b) => new Date(a.d) - new Date(b.d))) {
    const ts = new Date(t.d).getTime();
    const prev = lastBySym[t.sym];
    if (prev != null && ts - prev < SPAM_MS) continue; // spam — sayılmaz
    lastBySym[t.sym] = ts;
    out.push(t);
  }
  return out;
}

// Sicil kayıtlarından Edge Rütbesi hesapla
export function edgeRank(trades) {
  const counted = countable(trades || []);
  const capped = counted.map(t => Math.max(-CAP, Math.min(CAP, t.r)));
  const n = capped.length;
  const totalR = Math.round(capped.reduce((a, x) => a + x, 0) * 10) / 10;
  const t = n >= 2 ? Math.round(tStat(capped) * 10) / 10 : 0;

  let rank = EDGE_RANKS[0];
  for (const r of EDGE_RANKS) {
    if (n >= r.minN && totalR >= r.minR && (!r.needT || t >= 2)) rank = r;
  }

  // Bir sonraki rütbe için ne eksik? (kullanıcıya yol göstersin)
  const idx = EDGE_RANKS.indexOf(rank);
  const nxt = EDGE_RANKS[idx + 1] || null;
  let next = null;
  if (nxt) {
    const needs = [];
    if (n < nxt.minN) needs.push(`${nxt.minN - n} işlem daha`);
    if (totalR < nxt.minR) needs.push(`+${Math.ceil(nxt.minR - totalR)}R daha`);
    if (nxt.needT && t < 2) needs.push(`t ≥ 2 (şu an ${t})`);
    next = { name: nxt.name, needs };
  }

  return { name: rank.name, n, totalR, t, next };
}

// Katkı puanından Katkı Rütbesi (veri kaynağı AK-023 ile gelecek; motor hazır)
export function contribRank(points = 0) {
  let rank = CONTRIB_RANKS[0];
  for (const r of CONTRIB_RANKS) if (points >= r.minP) rank = r;
  const idx = CONTRIB_RANKS.indexOf(rank);
  const nxt = CONTRIB_RANKS[idx + 1] || null;
  return { name: rank.name, points, next: nxt ? { name: nxt.name, needP: nxt.minP - points } : null };
}
