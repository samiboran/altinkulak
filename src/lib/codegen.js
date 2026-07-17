// AK-087/C5: Strateji Çıkarıcı kod üreteci.
// Oluşum paneli seçimlerinden okunur, düzenlenebilir bir mySignal üretir.
// Kara kutu değil: her blok yorumlu, kullanıcı Kod Editörüm'de kurcalayabilir.
// Başta AK-PARAMS bloğu (paramsBlock.js sözleşmesi) — AK-084 görsel senkronu
// üretilen kodda da anında çalışır.
import { upsertParams } from "./paramsBlock.js";

// Desteklenen yapı taşları. check: PARAMS'lı koşul ifadesi (son bar i üzerinde).
const BLOCKS = {
  sweep: {
    label: "Likidite süpürme",
    params: { sweepLookback: 20, sweepMinPct: 0.0004, sweepMaxPct: 0.0035 },
    code: [
      "  // Likidite süpürme: son bar, önceki likidite seviyesini süpürüp geri kapandı mı?",
      "  const sweeps = h.findSweep(bars.slice(0, i + 1), PARAMS.sweepLookback, PARAMS.sweepMinPct, PARAMS.sweepMaxPct);",
      "  const sw = sweeps.find(s => s.i === i);",
      "  if (!sw) return null;",
      "  const dir = sw.dir; // 1 long, -1 short — yönü süpürme belirler",
    ],
  },
  fvg: {
    label: "FVG",
    params: { fvgMinAtr: 0.3 },
    code: [
      "  // FVG: yakın geçmişte yön ile uyumlu doldurulmamış boşluk var mı?",
      "  const fvgs = h.findFVG(bars.slice(0, i + 1), PARAMS.fvgMinAtr);",
      "  if (!fvgs.length) return null;",
    ],
  },
  ote: {
    label: "Fib / OTE",
    params: { oteLevel: 0.62, fibLookback: 60 },
    code: [
      "  // Fib OTE: fiyat optimal giriş bölgesinde mi?",
      "  const fib = h.findFib(bars.slice(0, i + 1), PARAMS.fibLookback);",
      "  if (!fib || !h.inOTE(bars[i].c, fib)) return null;",
    ],
  },
  candle: {
    label: "Mum kalıbı teyidi",
    params: {},
    code: [
      "  // Mum teyidi: son barda yön ile uyumlu kalıp (yutan / pin bar / marubozu)?",
      "  const pats = h.findCandlePatterns(bars, i, i).filter(p => p.dir !== 0);",
      "  if (!pats.some(p => p.dir === (typeof dir !== \"undefined\" ? dir : p.dir))) return null;",
    ],
  },
  emacross: {
    label: "EMA trend filtresi",
    params: { emaFast: 50, emaSlow: 200 },
    code: [
      "  // Trend filtresi: hızlı EMA yavaşın doğru tarafında mı?",
      "  const ef = h.ema(bars.slice(0, i + 1), PARAMS.emaFast), es = h.ema(bars.slice(0, i + 1), PARAMS.emaSlow);",
      "  const trendUp = ef[i] > es[i];",
      "  if (typeof dir !== \"undefined\" && ((dir === 1 && !trendUp) || (dir === -1 && trendUp))) return null;",
    ],
  },
};

export const AVAILABLE_BLOCKS = Object.entries(BLOCKS).map(([key, b]) => ({ key, label: b.label }));

// selections: BLOCKS anahtar dizisi (sıra = kontrol sırası, "sıralı" mantık v2 —
// v1 hepsi VE ile bağlanır). risk: { slR, tpR }. Dönen: çalıştırılabilir kod metni.
export function generateSignalCode(selections, risk = { slR: 2, tpR: 5 }) {
  const picked = (selections || []).filter(s => BLOCKS[s]);
  if (!picked.length) return null;

  // Yön üretmeyen kombinasyonlarda varsayılan yön bloğu gerekir: sweep yön verir,
  // vermiyorsa trend filtresinden türet, o da yoksa long varsay (kullanıcı düzenler).
  const hasDir = picked.includes("sweep");

  const params = { slR: risk.slR, tpR: risk.tpR };
  for (const s of picked) Object.assign(params, BLOCKS[s].params);

  const lines = [
    "// Strateji Çıkarıcı ile üretildi — bu bir HİPOTEZDİR.",
    "// Seçtiğin bölgeye uyması sürpriz değil; gerçek sınav tüm geçmişte OOS testi (t≥2).",
    "// Kodu serbestçe düzenleyebilirsin — AK-PARAMS bloğu grafikle senkron kalır.",
    "function mySignal(bars, h) {",
    "  const i = bars.length - 1;",
    "  if (i < 60) return null; // ısınma",
  ];
  if (!hasDir) {
    lines.push("  let dir = 1; // yön bloğu seçilmedi — varsayılan LONG, gerekirse değiştir");
  }
  for (const s of picked) lines.push("", ...BLOCKS[s].code);
  lines.push(
    "",
    "  // Risk planı: SL = giriş - dir × (PARAMS.slR × ATR yarımı), TP = R oranıyla",
    "  const a = h.atr(bars.slice(0, i + 1), 14)[i] || 0;",
    "  const entry = bars[i].c;",
    "  const stop = entry - dir * a * PARAMS.slR * 0.5;",
    "  const target = entry + dir * Math.abs(entry - stop) * PARAMS.tpR;",
    "  return { dir, entry, stop, target, sebep: " + JSON.stringify(picked.map(s => BLOCKS[s].label).join(" + ")) + " };",
    "}",
  );
  return upsertParams(lines.join("\n"), params);
}
