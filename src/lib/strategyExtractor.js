// AK-087: Strateji Çıkarıcı — "İncele" seçiminden oluşum kartlarına, oradan codegen.js'in
// AVAILABLE_BLOCKS anahtarlarına kadar SAF (test edilebilir) dönüşümler. Görsel/etkileşim
// Lab.jsx + StrategyExtractor.jsx'te; burada yalnız mantık.
import {
  findFVG, findSweep, findFib, inOTE, findCandlePatterns, findEmaCross,
  findOrderBlocks, findBOS, findMitigation, findSupportResistance,
  findDoubleTopBottom, findHeadShoulders, findTriangle, findDivergence, rsi,
} from "./detectors.js";

// C1: sürükleme uç noktalarından (bar index, sıra farketmez) normalize edilmiş [start,end] aralığı.
export function rangeFromIndices(aI, bI) {
  if (!Number.isFinite(aI) || !Number.isFinite(bI)) return null;
  return { start: Math.min(aI, bI), end: Math.max(aI, bI) };
}

// C3: oluşum TÜRÜ (detectors.js'in .type alanı ya da "ote") → codegen.js AVAILABLE_BLOCKS anahtarı.
// Eşleşmesi olmayan türler (ob/bos/mitigation/support-resistance) C2'de kart olarak görünür ama
// C3'te seçilemez — codegen.js'te bunlara karşılık gelen bir blok YOK (BLOKLAR SABİT, eklenmedi).
const TYPE_TO_BLOCK = {
  engulfing: "candle", pinbar: "candle", marubozu: "candle", doji: "candle", insidebar: "candle",
  sweep_low: "sweep", sweep_high: "sweep",
  fvg: "fvg",
  ote: "ote",
  golden_cross: "emacross", death_cross: "emacross",
  doubletop: "doubletop", doublebottom: "doublebottom",
  hs: "hs", ihs: "ihs",
  triangle_asc: "triangle", triangle_desc: "triangle", triangle_sym: "triangle",
  bullish_div: "divergence", bearish_div: "divergence",
};
export function mapOccurrenceToBlockKey(type) {
  return TYPE_TO_BLOCK[type] || null;
}

const TYPE_LABEL = {
  engulfing: "Yutan mum", pinbar: "Pin bar", marubozu: "Marubozu", doji: "Doji", insidebar: "Inside bar",
  sweep_low: "Süpürme (alt)", sweep_high: "Süpürme (üst)",
  fvg: "FVG",
  ote: "Fib / OTE bölgesi",
  golden_cross: "Golden cross", death_cross: "Death cross",
  ob: "Order Block", bos: "BOS (yapı kırılımı)", mitigation: "Mitigasyon", sr: "Destek/Direnç",
  doubletop: "Çift Tepe", doublebottom: "Çift Dip",
  hs: "Omuz-Baş-Omuz (OBO)", ihs: "Ters OBO",
  triangle_asc: "Yükselen Üçgen", triangle_desc: "Alçalan Üçgen", triangle_sym: "Simetrik Üçgen",
  bullish_div: "Boğa Uyumsuzluğu (Divergence)", bearish_div: "Ayı Uyumsuzluğu (Divergence)",
};

// C2: seçili bar aralığında TÜM dedektörler koşar, oluşum türüne göre gruplanmış kartlar döner.
// lookaheadBars: dedektörlerin ihtiyaç duyduğu bağlam için aralığın SONUNA kadar (± birkaç bar)
// tüm geçmiş taranır, ama yalnız [startIdx,endIdx] içine düşen oluşumlar sayılır — lookahead
// ihlali yok (gelecek bara asla bakılmaz, yalnız geçmiş bağlam kullanılır).
// opts.showRsi: true ise divergence de taranır (RSI hesaplaması gerektirir — grafik zaten RSI'yı
// açık göstermiyorsa gereksiz hesap yapılmaz, sessizce atlanır, hata fırlatılmaz).
export function analyzeRange(bars, startIdx, endIdx, opts = {}) {
  if (!bars || !bars.length) return { cards: [], blockKeysFound: [] };
  const lo = Math.max(0, startIdx), hi = Math.min(bars.length - 1, endIdx);
  if (hi < lo) return { cards: [], blockKeysFound: [] };
  const inRange = (i) => i >= lo && i <= hi;

  const counts = new Map(); // type -> count

  for (const c of findCandlePatterns(bars, lo, hi)) {
    if (c.type === "doji" || c.type === "insidebar") continue; // yönsüz, strateji kurucusunda gürültü — yalnız bilgi amaçlı gösterilmez
    counts.set(c.type, (counts.get(c.type) || 0) + 1);
  }
  for (const s of findSweep(bars)) if (inRange(s.i)) counts.set(s.type, (counts.get(s.type) || 0) + 1);
  for (const g of findFVG(bars)) if (inRange(g.i)) counts.set("fvg", (counts.get("fvg") || 0) + 1);
  for (const c of findEmaCross(bars)) if (inRange(c.i)) counts.set(c.type, (counts.get(c.type) || 0) + 1);
  for (const o of findOrderBlocks(bars)) if (inRange(o.i)) counts.set("ob", (counts.get("ob") || 0) + 1);
  for (const b of findBOS(bars)) if (inRange(b.i)) counts.set("bos", (counts.get("bos") || 0) + 1);
  for (const m of findMitigation(bars)) if (inRange(m.i)) counts.set("mitigation", (counts.get("mitigation") || 0) + 1);
  for (const s of findSupportResistance(bars)) if (inRange(s.lastI)) counts.set("sr", (counts.get("sr") || 0) + 1);
  for (const d of findDoubleTopBottom(bars)) if (inRange(d.i2)) counts.set(d.type, (counts.get(d.type) || 0) + 1);
  for (const h of findHeadShoulders(bars)) if (inRange(h.rightShoulderI)) counts.set(h.type, (counts.get(h.type) || 0) + 1);
  for (const t of findTriangle(bars)) if (inRange(t.endI)) counts.set(t.type, (counts.get(t.type) || 0) + 1);
  if (opts.showRsi) {
    const rsiArr = rsi(bars);
    for (const dv of findDivergence(bars, rsiArr)) if (inRange(dv.priceI2)) counts.set(dv.type, (counts.get(dv.type) || 0) + 1);
  }

  // OTE: findFib TEK bir güncel salınım döner (dizi değil) — aralıktaki barlardan kaçı o
  // salınımın OTE bölgesinde kapanmış diye sayılır (aralığın SONUNA kadar geçmişten hesaplanır).
  const fib = findFib(bars.slice(0, hi + 1));
  if (fib) {
    let oteHits = 0;
    for (let i = lo; i <= hi; i++) if (inOTE(bars[i].c, fib)) oteHits++;
    if (oteHits > 0) counts.set("ote", oteHits);
  }

  const cards = [...counts.entries()]
    .map(([type, count]) => ({ type, label: TYPE_LABEL[type] || type, count, blockKey: mapOccurrenceToBlockKey(type) }))
    .sort((a, b) => b.count - a.count);
  const blockKeysFound = [...new Set(cards.map(c => c.blockKey).filter(Boolean))];
  return { cards, blockKeysFound };
}

// C5-DÜRÜSTLÜK-KAPISI: "HİPOTEZ" etiketi OOS testi tamamlanana kadar ASLA kalkmaz — bu fonksiyon
// state geçişini merkezi ve test edilebilir kılar (D19: atlanamaz, kaldırılamaz).
// hyp: null (kod üretilmedi) | { tested:false } (üretildi, henüz test edilmedi) |
//      { tested:true, verdictGood:boolean, tStat:number } (OOS testi bitti)
export function hypothesisStatus(hyp) {
  if (!hyp) return null;
  if (!hyp.tested) return { label: "HİPOTEZ", tone: "warn" };
  return hyp.verdictGood
    ? { label: `DOĞRULANDI (t=${hyp.tStat})`, tone: "ok" }
    : { label: `REDDEDİLDİ (t=${hyp.tStat})`, tone: "bad" };
}
