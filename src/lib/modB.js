// Mod B v1.1 — dogrulanmis kural: 4H EMA50 bias + siki FVG (<0.3xATR14) + OTE (fib 0.618 bolgesi) + onay mumu.
// Saf fonksiyon: input bars -> sinyal listesi. UI/bildirim burada yok (bkz. notify.js, Izleme.jsx).
import { ema, atr, findFib, inOTE, fibSideOk } from "./detectors.js";

const MAX_GAP_ATR = 0.3;   // FVG, ATR14'un bu katindan dar olmali (siki bosluk)
const RISK_MULT = 2;       // R (risk birimi) = RISK_MULT x ATR14(sinyal barinda)

// 3 barlik FVG: bars[i-2] ile bars[i] arasindaki dokunulmamis bosluk.
function fvgAt(bars, i) {
  if (bars[i - 2].h < bars[i].l) return { dir: 1, lo: bars[i - 2].h, hi: bars[i].l };
  if (bars[i - 2].l > bars[i].h) return { dir: -1, lo: bars[i].h, hi: bars[i - 2].l };
  return null;
}

// bars: 4H OHLC dizisi ({o,h,l,c}, gercek veri icin +time Binance ms). sym: sinyal id'sinde kullanilir.
// Donen her sinyal: { id, sym, dir, entry, stop, hedef1, hedef2, r0, barIndex, time }
export function detectModBSignals(bars, sym = "") {
  if (!bars || bars.length < 60) return [];
  const e50 = ema(bars, 50);
  const a14 = atr(bars, 14);
  const out = [];

  for (let i = 2; i < bars.length - 1; i++) {
    if (e50[i] == null || !a14[i]) continue;

    // 1) 4H EMA50 bias
    const dir = bars[i].c > e50[i] ? 1 : bars[i].c < e50[i] ? -1 : 0;
    if (!dir) continue;

    // 2) siki FVG, bias yonuyle hizali
    const gap = fvgAt(bars, i);
    if (!gap || gap.dir !== dir) continue;
    const gapSize = gap.hi - gap.lo;
    if (gapSize <= 0 || gapSize >= a14[i] * MAX_GAP_ATR) continue;

    // 3) OTE (fib 0.618 bolgesi) + indirim/primli taraf
    const fib = findFib(bars.slice(0, i + 1));
    const mid = (gap.lo + gap.hi) / 2;
    if (!inOTE(mid, fib) || !fibSideOk(mid, fib, dir)) continue;

    // 4) onay mumu: bir sonraki bar, bias yonunde kapanir
    const conf = bars[i + 1];
    const confirmed = dir === 1
      ? conf.c > conf.o && conf.c > bars[i].c
      : conf.c < conf.o && conf.c < bars[i].c;
    if (!confirmed) continue;

    const r0 = a14[i];               // R0 = ATR14, sinyal (FVG) barinda
    const risk = r0 * RISK_MULT;     // 1R = 2xATR14
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
