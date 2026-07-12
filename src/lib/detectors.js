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
