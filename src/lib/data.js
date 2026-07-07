// Veri katmani — FAZ 1: deterministik ornek OHLC (statik), piyasa gruplu.
// FAZ ileri (AK-004b): her grup kendi gercek kaynagina baglanir
//   - Kripto: CCXT / borsa API (kullanici-basina ucretsiz, kolay)
//   - BIST:   gecikmeli, alt dagitici (Matriks/Foreks) — kullanici-basina ucretsiz katman
//   - ABD:    gecikmeli/EOD (Polygon, Twelve Data vb.)
//   - Avrupa: veri kaynagi bulununca (kosullu)
// getBars(symbol) imzasi sabit kalir; sadece icerigi gercek veriyle degisir.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genSeries({ seed, n = 900, start = 100, trend = 0.0006, noise = 0.011, rho = 0.2, cont = 0.0 }) {
  const rnd = mulberry32(seed);
  const bars = [];
  let c = start, prevShock = 0;
  const gaps = [];
  let contLeft = 0, contDir = 0;
  for (let i = 0; i < n; i++) {
    const o = c;
    let shock = rho * prevShock + (rnd() - 0.5) * 2 * noise * (1 - Math.abs(rho));
    prevShock = shock;
    if (contLeft > 0) { shock += contDir * noise * cont; contLeft--; }
    const close = o * (1 + trend + shock);
    const hi = Math.max(o, close) * (1 + rnd() * noise * 0.7);
    const lo = Math.min(o, close) * (1 - rnd() * noise * 0.7);
    const bar = { t: i, o: +o.toFixed(4), h: +hi.toFixed(4), l: +lo.toFixed(4), c: +close.toFixed(4) };
    bars.push(bar); c = close;
    if (i >= 2) {
      if (bars[i - 2].h < bar.l) gaps.push({ dir: 1, mid: (bar.l + bars[i - 2].h) / 2, retested: false });
      else if (bars[i - 2].l > bar.h) gaps.push({ dir: -1, mid: (bars[i - 2].l + bar.h) / 2, retested: false });
    }
    if (cont > 0) for (const g of gaps) {
      if (!g.retested && bar.l <= g.mid && bar.h >= g.mid) { g.retested = true; contLeft = 3 + Math.floor(rnd() * 3); contDir = g.dir; break; }
    }
  }
  return bars;
}

// Piyasa gruplari. cont>0 = gomulu edge; cont=0 = duz rastgele (kontrol).
const PROFILES = {
  // Kripto
  BTC:  { seed: 101, trend: 0.0006, noise: 0.011, rho: 0.20, cont: 1.5 },
  ETH:  { seed: 202, trend: 0.0008, noise: 0.012, rho: 0.24, cont: 1.9 },
  SOL:  { seed: 303, trend: 0.0011, noise: 0.013, rho: 0.30, cont: 2.4 },
  // BIST
  ASELS:{ seed: 311, trend: 0.0009, noise: 0.012, rho: 0.26, cont: 2.0 },
  THYAO:{ seed: 312, trend: 0.0007, noise: 0.013, rho: 0.22, cont: 1.4 },
  GARAN:{ seed: 313, trend: 0.0005, noise: 0.011, rho: 0.18, cont: 0.9 },
  SISE: { seed: 314, trend: 0.0008, noise: 0.012, rho: 0.24, cont: 1.7 },
  // ABD
  NVDA: { seed: 321, trend: 0.0013, noise: 0.014, rho: 0.32, cont: 2.6 },
  AAPL: { seed: 322, trend: 0.0007, noise: 0.010, rho: 0.22, cont: 1.5 },
  TSLA: { seed: 323, trend: 0.0009, noise: 0.018, rho: 0.20, cont: 1.2 },
  MSFT: { seed: 324, trend: 0.0008, noise: 0.010, rho: 0.26, cont: 1.8 },
  // Avrupa (kosullu — veri bulununca)
  ASML: { seed: 331, trend: 0.0010, noise: 0.013, rho: 0.28, cont: 2.1 },
  SAP:  { seed: 332, trend: 0.0006, noise: 0.011, rho: 0.20, cont: 1.3 },
  MC:   { seed: 333, trend: 0.0007, noise: 0.012, rho: 0.22, cont: 1.6 },
  // Kontrol
  RND:  { seed: 404, trend: 0.0,    noise: 0.012, rho: 0.0,  cont: 0.0 },
};

// Kullanici arayuzu icin grup yapisi
export const MARKET_GROUPS = [
  { key: "kripto",  label: "Kripto", symbols: ["BTC", "ETH", "SOL"] },
  { key: "bist",    label: "BIST",   symbols: ["ASELS", "THYAO", "GARAN", "SISE"] },
  { key: "abd",     label: "ABD",    symbols: ["NVDA", "AAPL", "TSLA", "MSFT"] },
  { key: "avrupa",  label: "Avrupa", symbols: ["ASML", "SAP", "MC"], pending: true },
  { key: "kontrol", label: "Kontrol", symbols: ["RND"], note: "Rastgele — edge bulunmamalı" },
];

const cache = {};
export function getBars(symbol = "SOL") {
  const sym = String(symbol).toUpperCase();
  // gerçek veri yüklüyse onu kullan (AK-004b) — imza aynı, içerik gerçek
  if (realCache[sym]) return realCache[sym];
  if (cache[sym]) return cache[sym];
  const p = PROFILES[sym] || PROFILES.SOL;
  cache[sym] = genSeries(p);
  return cache[sym];
}
export const SYMBOLS = Object.keys(PROFILES);

// Sembol arama (akıllı tamamlama) için isimli düz liste
const NAMES = {
  BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana",
  ASELS:"Aselsan", THYAO:"Türk Hava Yolları", GARAN:"Garanti BBVA", SISE:"Şişecam",
  NVDA:"NVIDIA", AAPL:"Apple", TSLA:"Tesla", MSFT:"Microsoft",
  ASML:"ASML", SAP:"SAP", MC:"LVMH", RND:"Rastgele (kontrol)",
};
export const ALL_SYMBOLS = MARKET_GROUPS.flatMap((g) =>
  g.symbols.map((s) => ({ sym: s, name: NAMES[s] || s, group: g.label }))
);

// ================= AK-004b FAZ 1: GERÇEK KRİPTO VERİSİ =================
// Binance halka açık kline API — key GEREKTİRMEZ, CORS açık, proxy gerekmez.
// data-api.binance.vision = salt piyasa-verisi aynası (birincil); api.binance.com yedek.
// BIST/ABD/Avrupa sentetik kalır (lisanslı kaynak = sonraki faz). RND daima sentetik (kontrol).

const REAL_MAP = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" };
export const REAL_CAPABLE = Object.keys(REAL_MAP);
const realCache = {};
const LS_TTL = 60 * 60 * 1000; // 1 saat — 4H barlar için yeterince taze

// Binance kline dizisini motor formatına çevir (saf fonksiyon — test edilir)
// kline: [openTime, open, high, low, close, volume, ...] (string sayılar)
export function parseKlines(raw) {
  return raw.map((k, i) => ({ t: i, time: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] || 0 }));
}

export function isReal(symbol) { return !!realCache[symbol?.toUpperCase()]; }

export async function loadReal(symbol) {
  const sym = String(symbol).toUpperCase();
  const pair = REAL_MAP[sym];
  if (!pair) return null;                       // gerçek kaynak yok -> sentetik kalır
  if (realCache[sym]) return realCache[sym];

  // localStorage önbelleği (varsa ve tazeyse ağa çıkma)
  const lsKey = `ak_bars_v1_${sym}`;
  if (typeof localStorage !== "undefined") {
    try {
      const c = JSON.parse(localStorage.getItem(lsKey));
      if (c && Date.now() - c.ts < LS_TTL && Array.isArray(c.bars) && c.bars.length > 100) {
        realCache[sym] = c.bars;
        return c.bars;
      }
    } catch { /* bozuk önbellek — yeniden çek */ }
  }

  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=4h&limit=900`,
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=4h&limit=900`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const raw = await r.json();
      if (!Array.isArray(raw) || raw.length < 100) continue;
      const bars = parseKlines(raw);
      realCache[sym] = bars;
      if (typeof localStorage !== "undefined") {
        try { localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), bars })); } catch { /* dolu — önemsiz */ }
      }
      return bars;
    } catch { /* ağ hatası — sıradaki URL */ }
  }
  return null; // hepsi başarısız -> sentetik fallback, UI "örnek veri" gösterir
}
