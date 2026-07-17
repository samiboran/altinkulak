// Grafik katmanları için kavram dedektörleri (saf fonksiyonlar).
// FVG matematiksel net; OB/BOS sezgisel/heuristik — ileride kalibre edilir.

export function atr(bars, period = 14) {
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out = new Array(bars.length).fill(null);
  for (let i = period; i <= tr.length; i++) {
    const s = tr.slice(i - period, i);
    out[i] = s.reduce((a, x) => a + x, 0) / period;
  }
  return out;
}

export function ema(bars, period = 20) {
  const k = 2 / (period + 1);
  let e = bars[0].c;
  return bars.map((b, i) => (e = i ? b.c * k + e * (1 - k) : b.c));
}

// RSI (Wilder yumuşatma): ilk `period` barlık ortalama kazanç/kayıp, sonrası (period-1)/period
// üstel ağırlıklı devam. İlk `period` bar için değer yok (null) — lookahead yok.
export function rsi(bars, period = 14) {
  const out = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].c - bars[i - 1].c;
    if (diff > 0) gainSum += diff; else lossSum += -diff;
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].c - bars[i - 1].c;
    const gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// FVG: 3 barlık dokunulmamış boşluk, ATR ölçekli
export function findFVG(bars, maxGapATR = 0.6) {
  const a = atr(bars), out = [];
  for (let i = 2; i < bars.length; i++) {
    if (!a[i]) continue;
    if (bars[i - 2].h < bars[i].l) {
      const gap = bars[i].l - bars[i - 2].h;
      if (gap > 0 && gap < a[i] * maxGapATR) out.push({ i, dir: 1, lo: bars[i - 2].h, hi: bars[i].l });
    } else if (bars[i - 2].l > bars[i].h) {
      const gap = bars[i - 2].l - bars[i].h;
      if (gap > 0 && gap < a[i] * maxGapATR) out.push({ i, dir: -1, lo: bars[i].h, hi: bars[i - 2].l });
    }
  }
  return out;
}

// Order Block: güçlü yükselişten önceki son düşüş mumunun gövdesi (kabaca)
export function findOrderBlocks(bars) {
  const out = [];
  for (let i = 3; i < bars.length - 1; i++) {
    if (bars[i].c > bars[i].o * 1.015 && bars[i - 1].c < bars[i - 1].o) {
      out.push({ i: i - 1, lo: bars[i - 1].l, hi: bars[i - 1].o });
    }
  }
  return out.slice(-8);
}

// BOS: önceki 5 barlık tepenin kırılması
export function findBOS(bars) {
  const out = [];
  for (let i = 6; i < bars.length; i++) {
    const prevHigh = Math.max(...bars.slice(i - 6, i - 1).map(b => b.h));
    if (bars[i].c > prevHigh) out.push({ i, price: prevHigh });
  }
  return out.slice(-6);
}

// --- AK-012b: kavram hizalama yardımcıları ---

// Fiyat bir OB bölgesine yakın mı?
export function isNearOB(price, obs, tol) {
  for (const o of obs) { if (price >= o.lo - tol && price <= o.hi + tol) return true; }
  return false;
}

// EMA eğimine göre trend yönü dizisi (+1 yukarı / -1 aşağı / 0 belirsiz)
export function trendArr(bars, period = 50, look = 5) {
  const e = ema(bars, period);
  const out = new Array(bars.length).fill(0);
  for (let i = look; i < bars.length; i++) {
    if (e[i] == null || e[i - look] == null) continue;
    out[i] = e[i] > e[i - look] ? 1 : -1;
  }
  return out;
}

// --- AK-012c: Mitigation / Order Flow / Fibonacci ---

// Mitigation: önceki bir OB bölgesine fiyatın geri dönüp "mitigasyon" yaptığı noktalar
export function findMitigation(bars) {
  const obs = findOrderBlocks(bars);
  const out = [];
  for (const o of obs) {
    for (let j = o.i + 3; j < Math.min(o.i + 50, bars.length); j++) {
      if (bars[j].l <= o.hi && bars[j].h >= o.lo) { out.push({ i: j, lo: o.lo, hi: o.hi, price: (o.lo + o.hi) / 2 }); break; }
    }
  }
  return out.slice(-8);
}

// Order flow yönü: son k mum gövdesi toplamının işareti (displacement/baskı)
export function orderFlowArr(bars, k = 5) {
  const out = new Array(bars.length).fill(0);
  for (let i = k; i < bars.length; i++) {
    let s = 0; for (let j = i - k + 1; j <= i; j++) s += bars[j].c - bars[j].o;
    out[i] = s > 0 ? 1 : s < 0 ? -1 : 0;
  }
  return out;
}

// Fibonacci: pencere içindeki son belirgin salınım + seviyeler (OTE 0.62–0.79 dahil)
export function findFib(bars, lookback = 60) {
  const seg = bars.slice(-lookback);
  if (seg.length < 5) return null;
  let hiI = 0, loI = 0;
  seg.forEach((b, i) => { if (b.h > seg[hiI].h) hiI = i; if (b.l < seg[loI].l) loI = i; });
  const hi = seg[hiI].h, lo = seg[loI].l, rg = hi - lo || 1;
  const up = loI < hiI; // dip önce -> yükseliş salınımı
  const ratios = [0.5, 0.618, 0.705, 0.786];
  const levels = ratios.map(r => ({ r, price: up ? hi - rg * r : lo + rg * r }));
  return { hi, lo, up, levels, ote: { a: up ? hi - rg * 0.786 : lo + rg * 0.5, b: up ? hi - rg * 0.5 : lo + rg * 0.786 } };
}
export function inOTE(price, fib) {
  if (!fib) return false;
  const lo = Math.min(fib.ote.a, fib.ote.b), hi = Math.max(fib.ote.a, fib.ote.b);
  return price >= lo && price <= hi;
}

// Fib indirim/primli bölge: long indirimde (alt yarı), short primli (üst yarı)
export function fibSideOk(price, fib, dir) {
  if (!fib) return false;
  const mid = (fib.hi + fib.lo) / 2;
  return dir === 1 ? price <= mid : price >= mid;
}

// ================= AK-087/C8 FAZ 1: Mum kalıbı dedektörleri =================
// Hepsi deterministik tek/çift mum matematiği. Her fonksiyon i indeksindeki mumu
// (gerekirse i-1 ile birlikte) değerlendirir — lookahead YOK, i+1'e asla bakılmaz.
// Dizi tarayıcıları {i, dir, type} listesi döner; dir: 1 boğa, -1 ayı, 0 nötr.

function body(b) { return Math.abs(b.c - b.o); }
function range(b) { return b.h - b.l; }
function upperWick(b) { return b.h - Math.max(b.o, b.c); }
function lowerWick(b) { return Math.min(b.o, b.c) - b.l; }

// Yutan (engulfing): gövde önceki gövdeyi tam kapsar, yönler zıt.
export function isEngulfing(bars, i) {
  if (i < 1) return 0;
  const p = bars[i - 1], b = bars[i];
  if (body(b) === 0 || body(p) === 0) return 0;
  const bullPrev = p.c < p.o, bullNow = b.c > b.o;
  const engulf = Math.max(b.o, b.c) >= Math.max(p.o, p.c) && Math.min(b.o, b.c) <= Math.min(p.o, p.c);
  if (!engulf) return 0;
  if (bullPrev && bullNow) return 1;
  if (!bullPrev && !bullNow) return -1;
  return 0;
}

// Pin bar / çekiç: bir fitil gövdenin en az k katı, karşı fitil aralığın ≤%25'i.
export function isPinBar(bars, i, k = 2, oppFrac = 0.25) {
  const b = bars[i];
  const r = range(b);
  if (r === 0) return 0;
  const bd = body(b), up = upperWick(b), lo = lowerWick(b);
  if (lo >= k * Math.max(bd, r * 0.05) && up <= r * oppFrac) return 1;   // uzun alt fitil → boğa (çekiç)
  if (up >= k * Math.max(bd, r * 0.05) && lo <= r * oppFrac) return -1;  // uzun üst fitil → ayı (kayan yıldız)
  return 0;
}

// Doji: gövde, aralığın küçük bir kesri (varsayılan %10).
export function isDoji(bars, i, maxBodyFrac = 0.1) {
  const b = bars[i];
  const r = range(b);
  if (r === 0) return 0;
  return body(b) <= r * maxBodyFrac ? 1 : 0; // yönsüz → 1 "var" anlamında
}

// Inside bar: mum tamamen önceki mumun aralığı içinde.
export function isInsideBar(bars, i) {
  if (i < 1) return 0;
  const p = bars[i - 1], b = bars[i];
  return b.h <= p.h && b.l >= p.l ? 1 : 0;
}

// Marubozu: gövde aralığın büyük kısmı (varsayılan %90+), fitiller kırıntı.
export function isMarubozu(bars, i, minBodyFrac = 0.9) {
  const b = bars[i];
  const r = range(b);
  if (r === 0) return 0;
  if (body(b) < r * minBodyFrac) return 0;
  return b.c > b.o ? 1 : -1;
}

// Aralık tarayıcı: [from, to] (dahil) içindeki tüm kalıpları listeler.
export function findCandlePatterns(bars, from = 0, to = bars.length - 1) {
  const out = [];
  const lo = Math.max(0, from), hi = Math.min(bars.length - 1, to);
  for (let i = lo; i <= hi; i++) {
    let d;
    if ((d = isEngulfing(bars, i))) out.push({ i, dir: d, type: "engulfing" });
    if ((d = isPinBar(bars, i))) out.push({ i, dir: d, type: "pinbar" });
    if (isDoji(bars, i)) out.push({ i, dir: 0, type: "doji" });
    if (isInsideBar(bars, i)) out.push({ i, dir: 0, type: "insidebar" });
    if ((d = isMarubozu(bars, i))) out.push({ i, dir: d, type: "marubozu" });
  }
  return out;
}

// Golden/death cross: kısa EMA uzunu yukarı/aşağı keser. Mevcut ema() kullanılır.
export function findEmaCross(bars, fast = 50, slow = 200) {
  const f = ema(bars, fast), s = ema(bars, slow);
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) out.push({ i, dir: 1, type: "golden_cross" });
    else if (f[i - 1] >= s[i - 1] && f[i] < s[i]) out.push({ i, dir: -1, type: "death_cross" });
  }
  return out;
}

// Destek/direnç: swing high/low kümeleme. Swing = penceresindeki en uç bar;
// yakın seviyeler (tol×ATR) tek seviyeye birleşir, dokunuş sayısıyla puanlanır.
export function findSupportResistance(bars, swingWin = 5, tolATR = 0.5) {
  if (bars.length < swingWin * 2 + 1) return [];
  const a = atr(bars, 14);
  const pivots = [];
  for (let i = swingWin; i < bars.length - swingWin; i++) {
    const win = bars.slice(i - swingWin, i + swingWin + 1);
    if (bars[i].h === Math.max(...win.map(b => b.h))) pivots.push({ i, price: bars[i].h, side: "res" });
    if (bars[i].l === Math.min(...win.map(b => b.l))) pivots.push({ i, price: bars[i].l, side: "sup" });
  }
  const levels = [];
  for (const p of pivots) {
    const tol = (a[p.i] || a[a.length - 1] || 0) * tolATR;
    const hit = levels.find(L => Math.abs(L.price - p.price) <= tol && L.side === p.side);
    if (hit) { hit.touches++; hit.price = (hit.price * (hit.touches - 1) + p.price) / hit.touches; hit.lastI = p.i; }
    else levels.push({ price: p.price, side: p.side, touches: 1, lastI: p.i });
  }
  return levels.filter(L => L.touches >= 2).sort((x, y) => y.touches - x.touches);
}

// ================= AK-087/C3: Likidite süpürme (SweepLab portu) =================
// SweepLab (Judas Swing) çekirdeğinin genelleştirilmiş hali: referans seviye Asya
// seansı yerine son `lookback` barın high/low'u. Süpürme = seviyenin [minPct,maxPct]
// bandında ihlali + kapanışın SEVİYENİN İÇİNE geri dönmesi. Lookahead YOK:
// i'nin referansı yalnız [i-lookback, i-1] aralığından hesaplanır.
export function findSweep(bars, lookback = 20, minPct = 0.0004, maxPct = 0.0035) {
  const out = [];
  for (let i = lookback; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - lookback; j < i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    const b = bars[i];
    // LONG tetiği: alt likidite süpürüldü, kapanış geri üstte
    const altPct = (lo - b.l) / lo;
    if (b.l < lo && altPct >= minPct && altPct <= maxPct && b.c > lo)
      out.push({ i, dir: 1, type: "sweep_low", level: lo, pct: altPct });
    // SHORT tetiği: üst likidite süpürüldü, kapanış geri altta
    const ustPct = (b.h - hi) / hi;
    if (b.h > hi && ustPct >= minPct && ustPct <= maxPct && b.c < hi)
      out.push({ i, dir: -1, type: "sweep_high", level: hi, pct: ustPct });
  }
  return out;
}
