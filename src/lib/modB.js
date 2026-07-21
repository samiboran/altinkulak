// Sistemim — kullanicinin kendi ayarladigi kural: 4H EMA bias + siki FVG (<MAX_GAP_ATR x ATR14) + OTE (fib bolgesi) + onay mumu.
// Saf fonksiyon: input bars -> sinyal listesi. UI/bildirim burada yok (bkz. notify.js, Izleme.jsx).
// DEFAULT_PARAMS = eskiden "Mod B v1.1" olarak sabitlenmis, dogrulanmis degerler — artik yalnizca baslangic sablonu.
import { ema, atr, findFib, fibSideOk, findOrderBlocks, isNearOB, trendArr, findMitigation, orderFlowArr } from "./detectors.js";

export const DEFAULT_PARAMS = {
  maxGapAtr: 0.3,  // FVG, ATR14'un bu katindan dar olmali (siki bosluk)
  riskMult: 2,     // R (risk birimi) = riskMult x ATR14(sinyal barinda)
  emaPeriod: 50,   // bias EMA periyodu
  fibLevel: 0.618, // OTE bolgesinin merkez fib orani
  concepts: [],    // AK-102: opsiyonel confluence filtreleri — "ob"|"bos"|"mit"|"of"|"fib". Boşsa
                    // (varsayılan) ESKİ davranışla birebir aynı — bu, FVG'nin YERİNE geçen bağımsız
                    // bir dedektör seçimi DEĞİL, backtest.js'teki filterGaps ile AYNI kavramda:
                    // seçilen her kavram FVG girişine EK bir AND-filtresi olarak uygulanır.
};

// AK-103: concept id -> okunur etiket. Izleme.jsx'in "Ek onay şartı" checkbox'larıyla AYNI
// sözlük — üst bardaki gösterge (Sinyaller/Alarm Geçmişi başlığı) burayı kullanır, seçim
// değişince etiket de değişir (önceden hep "FVG" sabit kalıyordu, seçim yansımıyordu).
export const CONCEPT_LABELS = { ob: "Order Block", bos: "BOS", mit: "Mitigation", of: "Order Flow", fib: "Fibonacci" };

// AK-104: sinyal sağlık kontrolü — üretilen bir sinyalin giriş fiyatı, o an bilinen CANLI
// fiyattan çok sapıyorsa (yanlış sembol/ölçek/decimal ya da sentetik veriye yanlışlıkla düşme
// gibi bir hatanın belirtisi) tespit eder. Ana savunma Izleme.jsx'teki isReal() gate'i — bu,
// gelecekte AYNI hata sınıfı BAŞKA bir yoldan tekrar sızarsa son güvenlik ağı: sinyal sessizce
// kullanıcıya gitmesin, konsola açıkça loglanıp filtrelensin.
export function priceDeviationPct(price, livePrice) {
  if (!Number.isFinite(price) || !Number.isFinite(livePrice) || livePrice === 0) return null;
  return (Math.abs(price - livePrice) / Math.abs(livePrice)) * 100;
}
export function isSignalPriceSane(entry, livePrice, maxDeviationPct = 50) {
  const dev = priceDeviationPct(entry, livePrice);
  return dev == null ? true : dev <= maxDeviationPct; // canlı fiyat bilinmiyorsa reddetmeyiz — bilinemez durumda susturma yapmayız
}

// SAF fonksiyon: seçili concepts -> "FVG" ya da "FVG + Order Block + Mitigation" gibi okunur metin.
export function describeConcepts(concepts) {
  const extra = (concepts || []).map((c) => CONCEPT_LABELS[c]).filter(Boolean);
  return extra.length ? `FVG + ${extra.join(" + ")}` : "FVG";
}

// 3 barlik FVG: bars[i-2] ile bars[i] arasindaki dokunulmamis bosluk.
function fvgAt(bars, i) {
  if (bars[i - 2].h < bars[i].l) return { dir: 1, lo: bars[i - 2].h, hi: bars[i].l };
  if (bars[i - 2].l > bars[i].h) return { dir: -1, lo: bars[i].h, hi: bars[i - 2].l };
  return null;
}

// detectors.inOTE'nin parametreli hali: sabit 0.5-0.786 bandi yerine, ayni bant genisligi
// fibLevel etrafinda merkezlenir (fibLevel=0.618 => bant birebir eski inOTE ile ayni).
function inOTECustom(price, fib, fibLevel) {
  if (!fib) return false;
  const rg = fib.hi - fib.lo || 1;
  const lowR = fibLevel - 0.118, highR = fibLevel + 0.168;
  const a = fib.up ? fib.hi - rg * highR : fib.lo + rg * lowR;
  const b = fib.up ? fib.hi - rg * lowR : fib.lo + rg * highR;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return price >= lo && price <= hi;
}

// bars: 4H OHLC dizisi ({o,h,l,c}, gercek veri icin +time Binance ms). sym: sinyal id'sinde kullanilir.
// params: kullanicinin "Sistemim" ayarlari — verilmezse DEFAULT_PARAMS kullanilir (eski davranisla birebir).
// Donen her sinyal: { id, sym, dir, entry, stop, hedef1, hedef2, r0, barIndex, time }
export function detectModBSignals(bars, sym = "", params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!bars || bars.length < 60) return [];
  const e50 = ema(bars, p.emaPeriod);
  const a14 = atr(bars, 14);
  const out = [];

  // AK-102: concept dizileri döngü İÇİNDE değil, İÇİNDE İHTİYAÇ duyulursa BİR KEZ hesaplanır
  // (O(n²) değil) — backtest.js'teki filterGaps'in aynısı, yalnız FVG üzerine AND-filtre.
  const concepts = p.concepts || [];
  const useOB = concepts.includes("ob"), useBOS = concepts.includes("bos");
  const useMit = concepts.includes("mit"), useOF = concepts.includes("of"), useFib2 = concepts.includes("fib");
  const obs = useOB ? findOrderBlocks(bars) : null;
  const tArr = useBOS ? trendArr(bars) : null;
  const mits = useMit ? findMitigation(bars) : null;
  const ofArr = useOF ? orderFlowArr(bars) : null;

  for (let i = 2; i < bars.length - 1; i++) {
    if (e50[i] == null || !a14[i]) continue;

    // 1) 4H EMA bias
    const dir = bars[i].c > e50[i] ? 1 : bars[i].c < e50[i] ? -1 : 0;
    if (!dir) continue;

    // 2) siki FVG, bias yonuyle hizali
    const gap = fvgAt(bars, i);
    if (!gap || gap.dir !== dir) continue;
    const gapSize = gap.hi - gap.lo;
    if (gapSize <= 0 || gapSize >= a14[i] * p.maxGapAtr) continue;

    // 3) OTE (fib bolgesi) + indirim/primli taraf
    const fib = findFib(bars.slice(0, i + 1));
    const mid = (gap.lo + gap.hi) / 2;
    if (!inOTECustom(mid, fib, p.fibLevel) || !fibSideOk(mid, fib, dir)) continue;

    // 3b) AK-102: isteğe bağlı confluence filtreleri (hiçbiri seçili değilse atlanır, eski davranış)
    if (concepts.length) {
      const tol = a14[i] * 0.6;
      if (useOB && !isNearOB(mid, obs, tol)) continue;
      if (useBOS && tArr[i] !== dir) continue;
      if (useMit && !isNearOB(mid, mits, tol)) continue;
      if (useOF && ofArr[i] !== dir) continue;
      if (useFib2 && !fibSideOk(mid, findFib(bars.slice(0, i + 1), 50), dir)) continue;
    }

    // 4) onay mumu: bir sonraki bar, bias yonunde kapanir
    const conf = bars[i + 1];
    const confirmed = dir === 1
      ? conf.c > conf.o && conf.c > bars[i].c
      : conf.c < conf.o && conf.c < bars[i].c;
    if (!confirmed) continue;

    const r0 = a14[i];               // R0 = ATR14, sinyal (FVG) barinda
    const risk = r0 * p.riskMult;    // 1R = riskMult x ATR14
    const entry = conf.c;
    const stop = dir === 1 ? entry - risk : entry + risk;
    const hedef1 = dir === 1 ? entry + risk : entry - risk;         // 1R — burada %50 kismi cikis
    const hedef2 = dir === 1 ? entry + risk * 3 : entry - risk * 3; // 3R
    const gapBarTime = bars[i].time ?? bars[i].t ?? i;

    out.push({
      id: `${sym}_${dir}_${gapBarTime}`,
      sym, dir, entry, stop, hedef1, hedef2, r0,
      barIndex: i + 1,
      time: conf.time ?? conf.t ?? (i + 1),
    });
  }
  return out;
}
