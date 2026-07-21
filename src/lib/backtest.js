// Backtest motoru — OHLC uzerinde FVG tespiti + islem simulasyonu.
// SweepLab Mod B mantiginin sadelestirilmis JS portu.
// OHLC formati: [{ t, o, h, l, c }]

import { tStat, trainTestSplit, verdict, sharpeLike } from "./stats.js";
import { findOrderBlocks, isNearOB, trendArr, findMitigation, orderFlowArr, findFib, fibSideOk } from "./detectors.js";

// ATR (basit, Wilder degil) — gap olcegi icin
function atr(bars, period = 14) {
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out = new Array(bars.length).fill(null);
  for (let i = period; i < tr.length + 1; i++) {
    const slice = tr.slice(i - period, i);
    out[i] = slice.reduce((s, x) => s + x, 0) / period;
  }
  return out;
}

// EMA — yon filtresi
function ema(bars, period) {
  const k = 2 / (period + 1);
  const out = new Array(bars.length).fill(null);
  let prev = bars[0].c;
  for (let i = 0; i < bars.length; i++) {
    prev = i === 0 ? bars[i].c : bars[i].c * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Bullish FVG: bar[i-2].h < bar[i].l  (arada bosluk).
// Bearish FVG: bar[i-2].l > bar[i].h
// Gap, ATR'nin maxGapATR katindan kucuk olmali (cok genis bosluk = guvenilmez).
function findFVGs(bars, atrArr, maxGapATR = 0.5) {
  const gaps = [];
  for (let i = 2; i < bars.length; i++) {
    const a = atrArr[i];
    if (!a) continue;
    const bull = bars[i - 2].h < bars[i].l;
    const bear = bars[i - 2].l > bars[i].h;
    if (bull) {
      const gap = bars[i].l - bars[i - 2].h;
      if (gap > 0 && gap < a * maxGapATR) gaps.push({ i, dir: 1, top: bars[i].l, bot: bars[i - 2].h });
    } else if (bear) {
      const gap = bars[i - 2].l - bars[i].h;
      if (gap > 0 && gap < a * maxGapATR) gaps.push({ i, dir: -1, top: bars[i - 2].l, bot: bars[i].h });
    }
  }
  return gaps;
}

// AK-073: tek bir giriş/stop/hedef üçlüsünün sonucunu simüle eder — hem bu dosyanın kendi
// simulate()'i HEM Lab.jsx'teki "Kendi Kodum" (kullanıcı kodu) yolu AYNI fonksiyonu kullanır,
// mantık iki yerde tekrarlanmaz. LOOKAHEAD-BIAS ENGELİ: yalnız entryIdx'ten SONRAKİ barlarla hesaplanır.
// R çarpanı rr parametresi almadan, verilen fiyatlardan çıkarılır: |target-entry|/|entry-stop|
// (ATR×rr tabanlı simulate() çağrısı için bu, verilen rr ile matematiksel olarak birebir aynıdır).
// Aynı barda hem stop hem hedefe değinirse muhafazakâr varsayım: stop önceliklidir.
// Döner: { outcome: number|null (-1 kayıp, +R kazanç, null = lookahead içinde ne olur ne biter), exitIdx: number|null }
export function simulateOutcome(bars, entryIdx, dir, entry, stop, target, lookahead = 40) {
  const risk = Math.abs(entry - stop);
  if (!risk) return { outcome: null, exitIdx: null };
  const rr = Math.abs(target - entry) / risk;
  for (let j = entryIdx + 1; j < Math.min(entryIdx + lookahead, bars.length); j++) {
    const hitStop = dir === 1 ? bars[j].l <= stop : bars[j].h >= stop;
    const hitTgt = dir === 1 ? bars[j].h >= target : bars[j].l <= target;
    if (hitStop) return { outcome: -1, exitIdx: j };    // ayni bar: muhafazakar, stop oncelik
    if (hitTgt) return { outcome: rr, exitIdx: j };
  }
  return { outcome: null, exitIdx: null };
}

// Bir FVG sonrasi: fiyat bosluga geri doner (retest), giris; stop/target R:R ile.
// LOOKAHEAD-BIAS ENGELI: giris ve sonuc yalnizca i. bardan SONRAKI barlarla hesaplanir.
// stopMult: stop genişliği çarpanı (×ATR). Geniş stop = az stoplanma ama hedef de uzar
// (R tanımı korunur: risk = stopMult×ATR; kayıp −1R, hedef +rr·R). Kullanıcı hipotezi test edebilsin diye parametre.
function simulate(bars, atrArr, gaps, rr = 3, lookahead = 40, stopMult = 1) {
  const trades = [];
  for (const g of gaps) {
    const entryZone = (g.top + g.bot) / 2;
    const a = atrArr[g.i] || (g.top - g.bot);
    let entered = false, entryIdx = -1, entryPx = 0;
    // retest ara (i+1 ... i+lookahead)
    for (let j = g.i + 1; j < Math.min(g.i + lookahead, bars.length); j++) {
      const touch = bars[j].l <= entryZone && bars[j].h >= entryZone;
      if (touch) { entered = true; entryIdx = j; entryPx = entryZone; break; }
    }
    if (!entered) continue;
    const risk = a * stopMult; // 1R = stopMult × ATR
    const stop = g.dir === 1 ? entryPx - risk : entryPx + risk;
    const target = g.dir === 1 ? entryPx + risk * rr : entryPx - risk * rr;
    const { outcome } = simulateOutcome(bars, entryIdx, g.dir, entryPx, stop, target, lookahead);
    if (outcome !== null) trades.push({ entryIdx, dir: g.dir, entry: entryPx, stop, target, outcome });
  }
  return trades;
}


// Monte Carlo: islem sonuclarini N kez karistirip (bootstrap) sonuc dagilimini ver.
// Amac: TEK equity curve'e guvenme — ayni edge ile bile sonuc araligi genistir.
export function monteCarlo(outcomes, runs = 1000) {
  if (!outcomes || outcomes.length < 5) return null;
  const n = outcomes.length;
  let seed = 12345;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const finals = [], dds = [];
  for (let r = 0; r < runs; r++) {
    let eq = 0, peak = 0, mdd = 0;
    for (let k = 0; k < n; k++) { eq += outcomes[Math.floor(rnd() * n)]; peak = Math.max(peak, eq); mdd = Math.max(mdd, peak - eq); }
    finals.push(eq); dds.push(mdd);
  }
  finals.sort((a, b) => a - b); dds.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const r1 = x => Math.round(x * 10) / 10;
  return {
    medianR: r1(q(finals, 0.5)), p05R: r1(q(finals, 0.05)), p95R: r1(q(finals, 0.95)),
    medianDD: r1(q(dds, 0.5)), worstDD: r1(q(dds, 0.95)),
    negPct: Math.round(finals.filter(x => x < 0).length / runs * 100),
  };
}

// Bar-bazli getiriler (rastgele kontrol grubu icin)
function barReturns(bars) {
  const r = [];
  for (let i = 1; i < bars.length; i++) r.push((bars[i].c - bars[i - 1].c) / bars[i - 1].c);
  return r;
}


// Seed'li PRNG (kontrol grubu deterministik olsun)
function mulberry32(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

// Rastgele giris kontrol grubu: ayni R:R ve stop mantigiyla, rastgele bar/yonde
// girisler uret, t-stat dagiliminin %95'ini dondur. Gercek strateji bunu asmali.
// costR: islem basina maliyet (R) — kontrol da AYNI maliyeti oder (adil kiyas).
// AK-073: Lab.jsx'in "Kendi Kodum" istatistik hesabı da (gözlemlenen ortalama R ile) bunu kullanır — export edildi.
export function randomEntryControl(bars, atrArr, rr, tradeCount, lookahead, runs = 300, seed = 777, costR = 0, stopMult = 1) {
  if (tradeCount < 2) return { p95: 0, meanT: 0 };
  const rnd = mulberry32(seed);
  const valid = [];
  for (let i = 20; i < bars.length - lookahead - 1; i++) if (atrArr[i]) valid.push(i);
  if (valid.length < tradeCount) return { p95: 0, meanT: 0 };
  const ts = [];
  for (let r = 0; r < runs; r++) {
    const picks = [];
    for (let k = 0; k < tradeCount; k++) {
      const idx = valid[Math.floor(rnd() * valid.length)];
      const dir = rnd() < 0.5 ? 1 : -1;
      const a = atrArr[idx];
      const entry = bars[idx].c;
      const risk0 = a * stopMult;
      const stop = dir === 1 ? entry - risk0 : entry + risk0;
      const target = dir === 1 ? entry + risk0 * rr : entry - risk0 * rr;
      let outcome = null;
      for (let j = idx + 1; j < Math.min(idx + lookahead, bars.length); j++) {
        const hitStop = dir === 1 ? bars[j].l <= stop : bars[j].h >= stop;
        const hitTgt = dir === 1 ? bars[j].h >= target : bars[j].l <= target;
        if (hitStop) { outcome = -1; break; }
        if (hitTgt) { outcome = rr; break; }
      }
      if (outcome !== null) picks.push(outcome - costR);
    }
    if (picks.length >= 2) ts.push(Math.abs(tStat(picks)));
  }
  ts.sort((a, b) => a - b);
  return { p95: ts[Math.floor(ts.length * 0.95)] || 0, meanT: ts.reduce((s,x)=>s+x,0)/(ts.length||1) };
}


// Kavram AND'leme: FVG girisini secili diger kavramlarla hizali olanlara indir.
// OB secili -> giris bir OB bolgesine yakin olmali. BOS secili -> trend yonu gap yonuyle ayni.
function filterGaps(gaps, bars, atrArr, concepts) {
  if (!concepts) return gaps;
  const useOB = concepts.includes("ob"), useBOS = concepts.includes("bos");
  const useMit = concepts.includes("mit"), useOF = concepts.includes("of"), useFib = concepts.includes("fib");
  if (!useOB && !useBOS && !useMit && !useOF && !useFib) return gaps;
  const obs = useOB ? findOrderBlocks(bars) : [];
  const tArr = useBOS ? trendArr(bars) : null;
  const mits = useMit ? findMitigation(bars) : [];
  const ofArr = useOF ? orderFlowArr(bars) : null;
  return gaps.filter((g) => {
    const mid = (g.top + g.bot) / 2;
    const tol = (atrArr[g.i] || (g.top - g.bot)) * 0.6;
    if (useOB && !isNearOB(mid, obs, tol)) return false;
    if (useBOS && tArr[g.i] !== g.dir) return false;
    if (useMit && !isNearOB(mid, mits, tol)) return false;           // mits de {lo,hi}
    if (useOF && ofArr[g.i] !== g.dir) return false;
    if (useFib && !fibSideOk(mid, findFib(bars.slice(0, g.i + 1), 50), g.dir)) return false; // indirim/primli
    return true;
  });
}

// Ana giris noktasi
// costR: islem basina gidis-donus maliyet, R cinsinden (komisyon + slippage).
// Orn. 0.05 = riskin %5'i. Kazanc rr-costR, kayip -1-costR olur; kontrol grubu da ayni maliyeti oder.
export function runBacktest(bars, { rr = 3, maxGapATR = 0.5, concepts = ["fvg"], costR = 0, stopMult = 1 } = {}) {
  if (!bars || bars.length < 60) return null;
  const atrArr = atr(bars);
  const gaps = filterGaps(findFVGs(bars, atrArr, maxGapATR), bars, atrArr, concepts);

  // train/test bolme — barlar uzerinden (filtre OOS'a da uygulanir)
  const { test } = trainTestSplit(bars, 0.7);
  const atrTest = atr(test);
  const gapsTest = filterGaps(findFVGs(test, atrTest, maxGapATR), test, atrTest, concepts);
  const testSim = simulate(test, atrTest, gapsTest, rr, 40, stopMult);
  const testR = testSim.map((t) => t.outcome - costR);

  const allSim = simulate(bars, atrArr, gaps, rr, 40, stopMult);
  const allR = allSim.map((t) => t.outcome - costR);
  const winsArr = allR.filter((x) => x > 0), lossArr = allR.filter((x) => x < 0);
  const winRate = allR.length ? Math.round((winsArr.length / allR.length) * 100) : 0;
  const expectancy = allR.length ? allR.reduce((a, x) => a + x, 0) / allR.length : 0;
  const grossWin = winsArr.reduce((a, x) => a + x, 0), grossLoss = Math.abs(lossArr.reduce((a, x) => a + x, 0));
  const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  const avgWin = winsArr.length ? grossWin / winsArr.length : 0;
  const avgLoss = lossArr.length ? grossLoss / lossArr.length : 0;

  // equity & drawdown
  let eq = 0, peak = 0, maxDD = 0;
  const curve = [];
  for (const r of allR) { eq += r; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); curve.push(eq); }

  const tOOS = tStat(testR);
  const control = randomEntryControl(test, atrTest, rr, Math.max(testR.length, 2), 40, 300, 777, costR, stopMult);
  const v = verdict(tOOS, control);

  return {
    trades: allSim,                 // grafik icin trade listesi (global index)
    costR,
    tradeCount: allSim.length,
    oosTrades: testSim.length,
    winRate,
    maxDD: Math.round(maxDD * 10) / 10,
    tStat: Math.round(tOOS * 10) / 10,
    controlP95: Math.round(control.p95 * 10) / 10,
    sharpe: Math.round(sharpeLike(allR) * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    mc: monteCarlo(allR),
    curve,
    verdict: v,
  };
}

// İzleme.jsx watchlist kartı için: motorun ürettiği trade listesinden KRONOLOJİK OLARAK EN
// SON tamamlanmış FVG işlemini (giriş/stop/hedef + bar zaman damgası) çıkarır. trades dizisi
// entryIdx'e göre sıralı DEĞİLDİR (gap taraması sırasına göre eklenir, retest lookahead'i
// çakışabilir) — bu yüzden "son eleman" değil, en büyük entryIdx aranır.
// Hiç tamamlanmış trade yoksa null: sahte sinyal uydurmak yerine dürüst boş durum (D6).
// hipotez: D19 — t < 2 ise bu FVG kuralı henüz istatistiksel olarak doğrulanmamış bir hipotezdir.
export function latestFvgSignal(bars, result) {
  if (!result || !result.trades || !result.trades.length) return null;
  let t = null;
  for (const tr of result.trades) if (!t || tr.entryIdx > t.entryIdx) t = tr;
  const bar = bars[t.entryIdx];
  return {
    dir: t.dir,
    entry: t.entry,       // tam küsürat — yuvarlama yok, gösterim katmanı ayrıca biçimlendirir
    tp: t.target,
    sl: t.stop,
    timestamp: bar?.time ?? null,
    hipotez: result.tStat < 2,
  };
}
