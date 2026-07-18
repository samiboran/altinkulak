// AK-083-TAMAMLAMA/C5: Replay Ligi — küratörlü senaryo tanımları. Saf fonksiyonlar, Supabase'e
// bağımlı değil (skor/persistans replay.js'te).
//
// ÖNEMLİ (D6 dürüstlük): bu senaryolar GERÇEK tarihsel OHLC verisi DEĞİLDİR. Bu ortam (Claude Code
// sandbox'ı) canlı borsa API'lerine erişemiyor (ağ politikası engelliyor) — bu yüzden gerçek 2021/2020
// mum verisi gömülemedi. Bunun yerine, bilinen piyasa karakterlerinden (sert çöküş, sıkışma+kırılım,
// sahte kırılım) esinlenen, SABİT SEED'li sentetik senaryolar üretiliyor — tıpkı src/lib/data.js'in
// demo sembolleri gibi aynı aile. Başlıklar/açıklamalar bunu açıkça "temsili/sentetik" diye belirtir,
// belirli bir tarih/fiyat gerçekliği iddia etmez.
//
// Her kullanıcı için AYNI seed → herkes birebir aynı mum dizisini görür (adil percentile kıyası, C6).

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// phases: [{n, trend, noise}] — data.js:genSeries ile aynı ölçekte (bar-başı oransal trend/gürültü).
function genPhaseBars(seed, phases, start = 100) {
  const rnd = mulberry32(seed);
  let c = start;
  const bars = [];
  for (const ph of phases) {
    for (let i = 0; i < ph.n; i++) {
      const o = c;
      const shock = (rnd() - 0.5) * 2 * ph.noise;
      const close = o * (1 + ph.trend + shock);
      const hi = Math.max(o, close) * (1 + rnd() * ph.noise * 0.6);
      const lo = Math.min(o, close) * (1 - rnd() * ph.noise * 0.6);
      bars.push({ t: bars.length, o: +o.toFixed(4), h: +hi.toFixed(4), l: +lo.toFixed(4), c: +close.toFixed(4) });
      c = close;
    }
  }
  return bars;
}

export const SCENARIOS = [
  {
    id: "sert-cokus",
    title: "Ani Sert Çöküş",
    desc: "Sakin bir yatay bölgeden sonra ani ve sert bir düşüş — bilinen kripto çöküşlerinden esinlenen TEMSİLİ/sentetik senaryo (gerçek OHLC verisi değildir).",
    seed: 20210519,
    phases: [
      { n: 40, trend: 0.0004, noise: 0.006 },
      { n: 14, trend: -0.045, noise: 0.028 },
      { n: 20, trend: 0.012, noise: 0.016 },
    ],
    revealStart: 40,
  },
  {
    id: "sikisma-kirilim",
    title: "Sessiz Sıkışma → Patlama",
    desc: "Uzun süren dar bir yatay aralık, ardından sert bir yöne kırılım — sabırla FOMO arasındaki sınav. TEMSİLİ/sentetik senaryo.",
    seed: 20220613,
    phases: [
      { n: 55, trend: 0.0001, noise: 0.004 },
      { n: 25, trend: 0.03, noise: 0.014 },
    ],
    revealStart: 55,
  },
  {
    id: "sahte-kirilim",
    title: "Sahte Kırılım Tuzağı",
    desc: "Bir direnç kırılır gibi olur, sonra sert geri döner — erken giren FOMO'ya, sabreden ödüle kavuşur. TEMSİLİ/sentetik senaryo.",
    seed: 20230308,
    phases: [
      { n: 45, trend: 0.0003, noise: 0.005 },
      { n: 10, trend: 0.02, noise: 0.01 },
      { n: 25, trend: -0.028, noise: 0.02 },
    ],
    revealStart: 45,
  },
];

export function scenarioBars(scenario) {
  return genPhaseBars(scenario.seed, scenario.phases, 100);
}

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}
