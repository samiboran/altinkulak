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
  doubletop: {
    label: "Çift Tepe",
    params: { dtSwingWin: 5, dtTolAtr: 0.3 },
    code: [
      "  // Çift Tepe: iki benzer seviyeli tepe + boyun çizgisi kırılımı teyidi",
      "  const dt = h.findDoubleTopBottom(bars.slice(0, i + 1), PARAMS.dtSwingWin, PARAMS.dtTolAtr).find(p => p.type === \"doubletop\" && p.confirmed && p.i2 <= i);",
      "  if (!dt) return null;",
      "  const dir = -1; // çift tepe kırılımı → SHORT",
    ],
  },
  doublebottom: {
    label: "Çift Dip",
    params: { dtSwingWin: 5, dtTolAtr: 0.3 },
    code: [
      "  // Çift Dip: iki benzer seviyeli dip + boyun çizgisi kırılımı teyidi",
      "  const db = h.findDoubleTopBottom(bars.slice(0, i + 1), PARAMS.dtSwingWin, PARAMS.dtTolAtr).find(p => p.type === \"doublebottom\" && p.confirmed && p.i2 <= i);",
      "  if (!db) return null;",
      "  const dir = 1; // çift dip kırılımı → LONG",
    ],
  },
  hs: {
    label: "Omuz-Baş-Omuz (OBO)",
    params: { hsSwingWin: 5, hsTolAtr: 0.3 },
    code: [
      "  // OBO: sol omuz-baş-sağ omuz + boyun çizgisi kırılımı teyidi",
      "  const hp = h.findHeadShoulders(bars.slice(0, i + 1), PARAMS.hsSwingWin, PARAMS.hsTolAtr).find(p => p.type === \"hs\" && p.confirmed && p.rightShoulderI <= i);",
      "  if (!hp) return null;",
      "  const dir = -1; // OBO kırılımı → SHORT",
    ],
  },
  ihs: {
    label: "Ters OBO",
    params: { hsSwingWin: 5, hsTolAtr: 0.3 },
    code: [
      "  // Ters OBO: sol omuz-baş-sağ omuz + boyun çizgisi kırılımı teyidi",
      "  const hp = h.findHeadShoulders(bars.slice(0, i + 1), PARAMS.hsSwingWin, PARAMS.hsTolAtr).find(p => p.type === \"ihs\" && p.confirmed && p.rightShoulderI <= i);",
      "  if (!hp) return null;",
      "  const dir = 1; // ters OBO kırılımı → LONG",
    ],
  },
  triangle: {
    label: "Daralan Üçgen",
    params: { triLookback: 40, triMinTouches: 4 },
    code: [
      "  // Daralan üçgen: son pencerede üst/alt trend çizgileri yakınsıyor mu?",
      "  const tris = h.findTriangle(bars.slice(0, i + 1), PARAMS.triLookback, PARAMS.triMinTouches);",
      "  if (!tris.length) return null;",
    ],
  },
  divergence: {
    label: "RSI Uyumsuzluğu (Divergence)",
    params: { divLookback: 30 },
    code: [
      "  // RSI Divergence: fiyat ile RSI arasında uyumsuzluk var mı?",
      "  const rsiArr = h.rsi(bars.slice(0, i + 1));",
      "  const dv = h.findDivergence(bars.slice(0, i + 1), rsiArr, PARAMS.divLookback).find(d => d.priceI2 <= i);",
      "  if (!dv) return null;",
      "  const dir = dv.type === \"bullish_div\" ? 1 : -1;",
    ],
  },
  ob: {
    label: "Order Block",
    params: { obTolAtr: 0.5 },
    code: [
      "  // Order Block: yakın geçmişte boğa OB oluştu mu ve fiyat o bölgeyi test ediyor mu?",
      "  const obArr = h.findOrderBlocks(bars.slice(0, i + 1));",
      "  if (!obArr.length) return null;",
      "  const a_ob = h.atr(bars.slice(0, i + 1), 14)[i] || 0;",
      "  if (!h.isNearOB(bars[i].c, obArr, a_ob * PARAMS.obTolAtr)) return null;",
      "  const dir = 1; // Bullish OB bölgesine dönüş → LONG",
    ],
  },
  bos: {
    label: "BOS (yapı kırılımı)",
    params: {},
    code: [
      "  // BOS: son barda önceki 5 barın zirvesi kırıldı mı? (bullish yapı kırılımı)",
      "  const bosArr = h.findBOS(bars.slice(0, i + 1));",
      "  const bos = bosArr.find(s => s.i === i);",
      "  if (!bos) return null;",
      "  const dir = 1; // BOS: yakın yüksek kırıldı → LONG",
    ],
  },
  mitigation: {
    label: "Mitigasyon",
    params: {},
    code: [
      "  // Mitigasyon: önceki bir OB bölgesine fiyat ilk kez geri döndü mü?",
      "  const mitArr = h.findMitigation(bars.slice(0, i + 1));",
      "  const mit = mitArr.find(m => m.i === i);",
      "  if (!mit) return null;",
      "  const dir = 1; // OB mitigasyonu: OB bölgesine geri dönüş → LONG",
    ],
  },
  sr: {
    label: "Destek / Direnç",
    params: { srTolAtr: 0.5 },
    code: [
      "  // Destek/Direnç: fiyat bilinen bir S/R seviyesine yakın mı? (≥2 dokunuş)",
      "  const a_sr = h.atr(bars.slice(0, i + 1), 14)[i] || 0;",
      "  const srLevels = h.findSupportResistance(bars.slice(0, i + 1));",
      "  if (!srLevels.length) return null;",
      "  const srHit = srLevels.find(L => Math.abs(bars[i].c - L.price) <= a_sr * PARAMS.srTolAtr);",
      "  if (!srHit) return null;",
      "  const dir = srHit.side === \"sup\" ? 1 : -1; // destek → LONG, direnç → SHORT",
    ],
  },
};

export const AVAILABLE_BLOCKS = Object.entries(BLOCKS).map(([key, b]) => ({ key, label: b.label }));

// selections: BLOCKS anahtar dizisi (sıra = kontrol sırası, "sıralı" mantık v2 —
// v1 hepsi VE ile bağlanır). risk: { slR, tpR }. Dönen: çalıştırılabilir kod metni.
export function generateSignalCode(selections, risk = { slR: 2, tpR: 5 }) {
  const picked = (selections || []).filter(s => BLOCKS[s]);
  if (!picked.length) return null;

  // Yön üretmeyen kombinasyonlarda varsayılan yön bloğu gerekir: sweep/geometri/divergence
  // blokları kendi yönünü üretir (kırılım/uyumsuzluk yönü), vermeyenlerde long varsay (kullanıcı düzenler).
  const DIR_BLOCKS = ["sweep", "doubletop", "doublebottom", "hs", "ihs", "divergence", "ob", "bos", "mitigation", "sr"];
  const hasDir = picked.some(k => DIR_BLOCKS.includes(k));

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
