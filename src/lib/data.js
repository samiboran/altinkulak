import { fetchTop500 } from "./top500.js";

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
  AVAX: { seed: 305, trend: 0.0010, noise: 0.014, rho: 0.28, cont: 2.2 },
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
  { key: "kripto",  label: "Kripto", symbols: ["BTC", "ETH", "SOL", "AVAX"] },
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
  BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", AVAX:"Avalanche",
  ASELS:"Aselsan", THYAO:"Türk Hava Yolları", GARAN:"Garanti BBVA", SISE:"Şişecam",
  NVDA:"NVIDIA", AAPL:"Apple", TSLA:"Tesla", MSFT:"Microsoft",
  ASML:"ASML", SAP:"SAP", MC:"LVMH", RND:"Rastgele (kontrol)",
};
export const ALL_SYMBOLS = MARKET_GROUPS.flatMap((g) =>
  g.symbols.map((s) => ({ sym: s, name: NAMES[s] || s, group: g.label }))
);

// ================= AK-074: piyasa değerine göre ilk 500 kripto (yalnız arama) =================
// BİLEREK ALL_SYMBOLS'a KARIŞTIRILMAZ: Tarama.jsx tam-evren tarar ve N=ALL_SYMBOLS.length'i
// Bonferroni eşiğinde kullanır — 500 sentetik-profilsiz sembolü sessizce SOL'a düşürüp taramak
// hem yanlış istatistik hem AK-031 dürüstlük ihlali olurdu. Bunun yerine ayrı bir "arama listesi":
// yalnız Izleme.jsx'in sembol-ekle kutusu bunu kullanır; seçilen sembol yine pairFor/hasData'nın
// mevcut "bilinmeyen kripto → SEMBOL+USDT dene" mantığından geçer (dürüstlük korunur).
let top500Extra = []; // {sym,name,group:"Kripto"}[]
let top500Loaded = false;
export function getSearchSymbols() {
  if (!top500Extra.length) return ALL_SYMBOLS;
  const known = new Set(ALL_SYMBOLS.map((x) => x.sym));
  return [...ALL_SYMBOLS, ...top500Extra.filter((x) => !known.has(x.sym))];
}
export async function loadTop500Symbols() {
  if (top500Loaded) return;
  top500Loaded = true; // eşzamanlı çağrılar tekrar fetch atmasın
  try {
    const list = await fetchTop500();
    // CoinGecko'da aynı ticker'ı paylaşan farklı zincir/köprü tokenları olabilir (ör. çoklu DAI/USDF) —
    // piyasa değerine göre sıralı geldiği için İLK görülen (en yüksek piyasa değerli) tutulur.
    const seen = new Set();
    top500Extra = [];
    for (const c of list) {
      if (seen.has(c.sym)) continue;
      seen.add(c.sym);
      top500Extra.push({ sym: c.sym, name: c.name, group: "Kripto" });
    }
  } catch { top500Loaded = false; /* başarısızsa bir sonraki çağrıda tekrar denensin */ }
}

// ================= AK-004b FAZ 1: GERÇEK KRİPTO VERİSİ =================
// Binance halka açık kline API — key GEREKTİRMEZ, CORS açık, proxy gerekmez.
// data-api.binance.vision = salt piyasa-verisi aynası (birincil); api.binance.com yedek.
// BIST/ABD/Avrupa sentetik kalır (lisanslı kaynak = sonraki faz). RND daima sentetik (kontrol).

const REAL_MAP = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", AVAX: "AVAXUSDT" };
export const REAL_CAPABLE = Object.keys(REAL_MAP);
const realCache = {};
const realFail = new Set(); // bu oturumda Binance'te bulunamayanlar — tekrar deneme

// Sembol -> Binance çifti. Bilinen kripto: haritadan; bilinmeyen sembol: SEMBOL+USDT denenir
// (AVAX, LINK, DOGE...). Bilinen ama kripto-olmayan (BIST/ABD/Avrupa/Kontrol): asla denenmez.
export function pairFor(symbol) {
  const sym = String(symbol).toUpperCase();
  if (REAL_MAP[sym]) return REAL_MAP[sym];
  const meta = ALL_SYMBOLS.find(x => x.sym === sym);
  if (meta && meta.group !== "Kripto") return null;
  return sym + "USDT";
}

// Sembol için elimizde HERHANGİ bir veri var mı? (gerçek ya da tanımlı sentetik profil)
// Yoksa UI "veri yok" demeli — bilinmeyen sembole başka profilin sentetiğini gösterip
// sahte edge rozeti yakmak dürüstlük ihlalidir (AK-031 dersi).
export function hasData(symbol) {
  const sym = String(symbol).toUpperCase();
  return !!realCache[sym] || !!PROFILES[sym];
}
const LS_TTL = 60 * 60 * 1000; // 1 saat — 4H barlar için yeterince taze

// Binance kline dizisini motor formatına çevir (saf fonksiyon — test edilir)
// kline: [openTime, open, high, low, close, volume, ...] (string sayılar)
export function parseKlines(raw) {
  return raw.map((k, i) => ({ t: i, time: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] || 0 }));
}

// AK-051: son 24 saatin yüksek/düşük/hacim özeti — yalnız gerçek veride anlamlı
// (sentetik barlarda `time` yok; şimdiki zamandan 24s geriye giden barlar TF'ye göre otomatik değişir).
export function stats24h(bars) {
  if (!bars || !bars.length) return null;
  const lastBar = bars[bars.length - 1];
  if (!lastBar.time) return null; // sentetik veri — zaman damgası yok
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let high = -Infinity, low = Infinity, volSum = 0, openPrice = null, n = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (b.time < cutoff) break; // zaman artan sıralı — daha eskiye bakmaya gerek yok
    high = Math.max(high, b.h);
    low = Math.min(low, b.l);
    volSum += b.v || 0;
    openPrice = b.o; // döngü geriye doğru gittiği için son atanan değer 24s penceresinin EN ESKİ barının açılışı olur
    n++;
  }
  if (n === 0) return null;
  // AK-057: Binance'in 24s ticker tanımıyla tutarlı — (son kapanış - 24s önceki açılış) / açılış
  const chgPct = openPrice ? ((lastBar.c - openPrice) / openPrice) * 100 : 0;
  return { high, low, volSum, chgPct };
}

export function isReal(symbol) { return !!realCache[symbol?.toUpperCase()]; }
const realTF = {}; // sembol -> yüklü zaman dilimi
export function tfOf(symbol) { return realTF[symbol?.toUpperCase()] || "4h"; }
export const TIMEFRAMES = [["5m", "5dk"], ["15m", "15dk"], ["1h", "1s"], ["4h", "4s"], ["1d", "1G"]];

// AK-064: sembol -> Binance'ten en son BAŞARILI eşleşmenin zaman damgası (ağ isteği ya da
// hâlâ taze localStorage önbelleği — ikisi de "gerçekten Binance'ten geldi" anlamına gelir).
const fetchedAt = {};

// Saf fonksiyon (test edilir): "canli" (<60sn), "gecikmeli" (<LS_TTL, ör. "312 sn gecikme"),
// "baglanti_yok" (LS_TTL'den eski — önbellek bayatladı, sonraki loadReal ağa çıkacak ama henüz sonuç gelmedi).
export function freshnessStatus(ageSec) {
  if (ageSec < 60) return "canli";
  if (ageSec < LS_TTL / 1000) return "gecikmeli";
  return "baglanti_yok";
}

// Gerçek veri hiç yüklenmediyse (sentetik sembol) null döner — badge yalnız isReal(true) iken gösterilmeli.
export function getFreshness(symbol) {
  const ts = fetchedAt[symbol?.toUpperCase()];
  if (!ts) return null;
  const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return { status: freshnessStatus(ageSec), ageSec };
}

// AK-052: eşzamanlı istek koruması. Kullanıcı zaman dilimini hızlı değiştirirse (ör. 1s -> 4s)
// iki loadReal çağrısı aynı anda uçuşabilir; ağ sırası isteklerin BAŞLATILMA sırasıyla aynı
// olmak zorunda değildir. Eski (artık istenmeyen) istek geç dönerse paylaşılan realCache/realTF'i
// ezip sessizce yanlış zaman dilimini gösterebilir. Çözüm: sembol başına "en son başlatılan istek"
// sayacı — yalnız hâlâ en güncel olan istek paylaşılan önbelleğe yazar; eskisi kendi çağırana
// doğru veriyi döner ama global durumu bozmaz.
const fetchGen = {};
export async function loadReal(symbol, tf = "4h") {
  const sym = String(symbol).toUpperCase();
  const pair = pairFor(sym);
  if (!pair || realFail.has(sym)) return null;  // kaynak yok ya da bu oturumda bulunamadı
  if (realCache[sym] && realTF[sym] === tf) return realCache[sym];

  const myGen = (fetchGen[sym] = (fetchGen[sym] || 0) + 1);
  const stillLatest = () => fetchGen[sym] === myGen;

  // localStorage önbelleği (varsa ve tazeyse ağa çıkma)
  const lsKey = `ak_bars_v2_${sym}_${tf}`;
  if (typeof localStorage !== "undefined") {
    try {
      const c = JSON.parse(localStorage.getItem(lsKey));
      if (c && Date.now() - c.ts < LS_TTL && Array.isArray(c.bars) && c.bars.length > 100) {
        if (stillLatest()) { realCache[sym] = c.bars; realTF[sym] = tf; fetchedAt[sym] = c.ts; }
        return c.bars;
      }
    } catch { /* bozuk önbellek — yeniden çek */ }
  }

  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${tf}&limit=900`,
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=900`,
  ];
  let badSymbol = false;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.status >= 400 && r.status < 500) { badSymbol = true; continue; } // sembol/istek geçersiz
      if (!r.ok) continue;
      const raw = await r.json();
      if (!Array.isArray(raw) || raw.length < 100) continue;
      const bars = parseKlines(raw);
      if (stillLatest()) {
        realCache[sym] = bars; realTF[sym] = tf; fetchedAt[sym] = Date.now();
        if (typeof localStorage !== "undefined") {
          try { localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), bars })); } catch { /* dolu — önemsiz */ }
        }
      }
      return bars;
    } catch { /* ağ hatası — sıradaki URL */ }
  }
  if (badSymbol) realFail.add(sym); // yalnız "sembol yok" karalisteye girer; AĞ HATASI latch'lemez (sonraki denemede tekrar)
  return null; // başarısız -> bilinen sembolse sentetik, bilinmiyorsa hasData=false ("veri yok")
}
