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
// AK-095/Bug1: eskiden .slice(-8) ile son 8'e kesiliyordu — bu, Chart.jsx'in inWin
// filtresinden ÖNCE gerçekleşiyordu, yani kullanıcı geçmişe kaydırınca o bölgedeki
// gerçek OB'ler zaten silinmiş oluyordu. findFVG'de böyle bir limit yok (referans davranış),
// asıl sınırlama zaten çağıran taraftaki inWin() filtresinde.
export function findOrderBlocks(bars) {
  const out = [];
  for (let i = 3; i < bars.length - 1; i++) {
    if (bars[i].c > bars[i].o * 1.015 && bars[i - 1].c < bars[i - 1].o) {
      out.push({ i: i - 1, lo: bars[i - 1].l, hi: bars[i - 1].o });
    }
  }
  return out;
}

// BOS: önceki 5 barlık tepenin kırılması (AK-095/Bug1: bkz. findOrderBlocks notu — aynı sebep)
export function findBOS(bars) {
  const out = [];
  for (let i = 6; i < bars.length; i++) {
    const prevHigh = Math.max(...bars.slice(i - 6, i - 1).map(b => b.h));
    if (bars[i].c > prevHigh) out.push({ i, price: prevHigh });
  }
  return out;
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
// (AK-095/Bug1: bkz. findOrderBlocks notu — aynı sebep, aynı düzeltme)
export function findMitigation(bars) {
  const obs = findOrderBlocks(bars);
  const out = [];
  for (const o of obs) {
    for (let j = o.i + 3; j < Math.min(o.i + 50, bars.length); j++) {
      if (bars[j].l <= o.hi && bars[j].h >= o.lo) { out.push({ i: j, lo: o.lo, hi: o.hi, price: (o.lo + o.hi) / 2 }); break; }
    }
  }
  return out;
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

// ================= AK-088 FAZ 2: Geometri dedektörleri =================
// Ortak swing-point çıkarımı: findSupportResistance ile AYNI merkezi-pencere pivot fikri, ancak
// TEK FARK — pivot penceresinde TEK BAŞINA en uç bar olmalı (eşitlik yok). Düz/yatay barlarda
// (her bar diğerleriyle eşit) böylece hiç pivot bulunmaz; S/R'de kabul edilebilen bu dejenere
// durum, geometri kalıpları için "kalıp yok" dürüstlüğünü bozardı.
function swingPoints(bars, swingWin) {
  const highs = [], lows = [];
  for (let i = swingWin; i < bars.length - swingWin; i++) {
    const win = bars.slice(i - swingWin, i + swingWin + 1);
    const maxH = Math.max(...win.map(b => b.h));
    const minL = Math.min(...win.map(b => b.l));
    if (bars[i].h === maxH && win.filter(b => b.h === maxH).length === 1) highs.push({ i, price: bars[i].h });
    if (bars[i].l === minL && win.filter(b => b.l === minL).length === 1) lows.push({ i, price: bars[i].l });
  }
  return { highs, lows };
}

// Çift tepe / çift dip: iki benzer seviyeli swing (tolATR bandı), aralarında min mesafe (2×swingWin).
// confirmed: sağ tepe/dipten SONRA kapanış boyun çizgisini (aradaki en uç zıt seviye) kırdıysa —
// standart TA kuralı, "tamamlanmış kalıp" için şart.
export function findDoubleTopBottom(bars, swingWin = 5, tolATR = 0.3) {
  if (bars.length < swingWin * 2 + 1) return [];
  const a = atr(bars, 14);
  const { highs, lows } = swingPoints(bars, swingWin);
  const minGap = swingWin * 2;
  const out = [];
  for (let x = 0; x < highs.length; x++) {
    for (let y = x + 1; y < highs.length; y++) {
      const h1 = highs[x], h2 = highs[y];
      if (h2.i - h1.i < minGap) continue;
      const tol = (a[h2.i] || a[a.length - 1] || 0) * tolATR;
      if (Math.abs(h1.price - h2.price) > tol) continue;
      const neckline = Math.min(...bars.slice(h1.i, h2.i + 1).map(b => b.l));
      let confirmed = false;
      for (let j = h2.i + 1; j < bars.length; j++) if (bars[j].c < neckline) { confirmed = true; break; }
      out.push({ type: "doubletop", i1: h1.i, i2: h2.i, level: (h1.price + h2.price) / 2, neckline, confirmed });
    }
  }
  for (let x = 0; x < lows.length; x++) {
    for (let y = x + 1; y < lows.length; y++) {
      const l1 = lows[x], l2 = lows[y];
      if (l2.i - l1.i < minGap) continue;
      const tol = (a[l2.i] || a[a.length - 1] || 0) * tolATR;
      if (Math.abs(l1.price - l2.price) > tol) continue;
      const neckline = Math.max(...bars.slice(l1.i, l2.i + 1).map(b => b.h));
      let confirmed = false;
      for (let j = l2.i + 1; j < bars.length; j++) if (bars[j].c > neckline) { confirmed = true; break; }
      out.push({ type: "doublebottom", i1: l1.i, i2: l2.i, level: (l1.price + l2.price) / 2, neckline, confirmed });
    }
  }
  return out;
}

// OBO / Ters OBO: ardışık 3 swing (sol omuz / baş / sağ omuz). Omuzlar tolATR bandında benzer
// seviyede, baş ikisinden en az tolATR kadar belirgin şekilde uç olmalı. confirmed: C1 ile aynı
// ilke — sağ omuzdan sonra kapanış boyun çizgisini kırmalı.
export function findHeadShoulders(bars, swingWin = 5, tolATR = 0.3) {
  if (bars.length < swingWin * 2 + 1) return [];
  const a = atr(bars, 14);
  const { highs, lows } = swingPoints(bars, swingWin);
  const out = [];
  for (let k = 0; k + 2 < highs.length; k++) {
    const ls = highs[k], hd = highs[k + 1], rs = highs[k + 2];
    const tol = (a[rs.i] || a[a.length - 1] || 0) * tolATR;
    if (Math.abs(ls.price - rs.price) > tol) continue;
    if (!(hd.price > ls.price + tol && hd.price > rs.price + tol)) continue;
    const trough1 = Math.min(...bars.slice(ls.i, hd.i + 1).map(b => b.l));
    const trough2 = Math.min(...bars.slice(hd.i, rs.i + 1).map(b => b.l));
    const neckline = (trough1 + trough2) / 2;
    let confirmed = false;
    for (let j = rs.i + 1; j < bars.length; j++) if (bars[j].c < neckline) { confirmed = true; break; }
    out.push({ type: "hs", leftShoulderI: ls.i, headI: hd.i, rightShoulderI: rs.i, neckline, confirmed });
  }
  for (let k = 0; k + 2 < lows.length; k++) {
    const ls = lows[k], hd = lows[k + 1], rs = lows[k + 2];
    const tol = (a[rs.i] || a[a.length - 1] || 0) * tolATR;
    if (Math.abs(ls.price - rs.price) > tol) continue;
    if (!(hd.price < ls.price - tol && hd.price < rs.price - tol)) continue;
    const peak1 = Math.max(...bars.slice(ls.i, hd.i + 1).map(b => b.h));
    const peak2 = Math.max(...bars.slice(hd.i, rs.i + 1).map(b => b.h));
    const neckline = (peak1 + peak2) / 2;
    let confirmed = false;
    for (let j = rs.i + 1; j < bars.length; j++) if (bars[j].c > neckline) { confirmed = true; break; }
    out.push({ type: "ihs", leftShoulderI: ls.i, headI: hd.i, rightShoulderI: rs.i, neckline, confirmed });
  }
  return out;
}

// Basit lineer regresyon: eğim (m) ve y-kesimi (b), x = pencere-içi bar index.
function linReg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  const m = den === 0 ? 0 : num / den;
  return { m, b: my - m * mx };
}

// Daralan üçgen: son `lookback` bardaki lokal pivotlardan (2 barlık pencere) üst/alt trend
// çizgileri lineer regresyonla uydurulur. Eğime göre sınıflandırma (ATR-ölçekli düzlük eşiği):
// üst yatay + alt yükseliyor → yükselen; üst düşüyor + alt yatay → alçalan; ikisi de yakınsıyor
// (üst düşüyor, alt yükseliyor) → simetrik. Basit regresyon yeterli, curve-fitting gerekmez.
export function findTriangle(bars, lookback = 40, minTouches = 4) {
  if (bars.length < lookback) return [];
  const startI = bars.length - lookback;
  const seg = bars.slice(startI);
  const pivWin = 2;
  const highPts = [], lowPts = [];
  for (let i = pivWin; i < seg.length - pivWin; i++) {
    const w = seg.slice(i - pivWin, i + pivWin + 1);
    if (seg[i].h === Math.max(...w.map(b => b.h))) highPts.push({ x: i, y: seg[i].h });
    if (seg[i].l === Math.min(...w.map(b => b.l))) lowPts.push({ x: i, y: seg[i].l });
  }
  if (highPts.length < 2 || lowPts.length < 2 || highPts.length + lowPts.length < minTouches) return [];
  const upper = linReg(highPts), lower = linReg(lowPts);
  if (!upper || !lower) return [];
  const a = atr(bars, 14);
  const flat = (a[bars.length - 1] || a[a.length - 1] || 0) * 0.02;
  const upFlat = Math.abs(upper.m) < flat, loFlat = Math.abs(lower.m) < flat;
  let type = null;
  if (upFlat && lower.m > flat) type = "triangle_asc";
  else if (loFlat && upper.m < -flat) type = "triangle_desc";
  else if (upper.m < -flat && lower.m > flat) type = "triangle_sym";
  if (!type) return [];
  let apex = null;
  if (upper.m !== lower.m) {
    const xApex = (lower.b - upper.b) / (upper.m - lower.m);
    apex = { i: startI + Math.round(xApex), price: upper.m * xApex + upper.b };
  }
  return [{ type, startI, endI: bars.length - 1, upperSlope: upper.m, lowerSlope: lower.m, apex }];
}

// ================= AK-088 FAZ 3: Divergence (jenerik osilatör) =================
// Fiyat swing'leri (yüksek/düşük) ile dışarıdan verilen gösterge dizisi (rsi(bars) vb. — burada
// TEKRAR HESAPLANMAZ, çağıran sorumlu) arasında uyumsuzluk. Yalnız [n-lookback, n) penceresi
// taranır — kendisine kadar olan barlar, lookahead yok. Jenerik: herhangi bir osilatör array'i
// ile çalışır (MACD vb. ileride eklenirse bu fonksiyon yeniden yazılmaz).
export function findDivergence(bars, indicatorArr, lookback = 30) {
  if (!bars || !indicatorArr || !bars.length) return [];
  const win = 3;
  const n = bars.length;
  const from = Math.max(win, n - lookback);
  const priceHighs = [], priceLows = [];
  for (let i = from; i < n - win; i++) {
    const w = bars.slice(i - win, i + win + 1);
    if (bars[i].h === Math.max(...w.map(b => b.h))) priceHighs.push(i);
    if (bars[i].l === Math.min(...w.map(b => b.l))) priceLows.push(i);
  }
  const out = [];
  for (let x = 0; x < priceHighs.length; x++) {
    for (let y = x + 1; y < priceHighs.length; y++) {
      const i1 = priceHighs[x], i2 = priceHighs[y];
      if (indicatorArr[i1] == null || indicatorArr[i2] == null) continue;
      if (bars[i2].h > bars[i1].h && indicatorArr[i2] < indicatorArr[i1])
        out.push({ type: "bearish_div", priceI1: i1, priceI2: i2, indicatorI1: i1, indicatorI2: i2 });
    }
  }
  for (let x = 0; x < priceLows.length; x++) {
    for (let y = x + 1; y < priceLows.length; y++) {
      const i1 = priceLows[x], i2 = priceLows[y];
      if (indicatorArr[i1] == null || indicatorArr[i2] == null) continue;
      if (bars[i2].l < bars[i1].l && indicatorArr[i2] > indicatorArr[i1])
        out.push({ type: "bullish_div", priceI1: i1, priceI2: i2, indicatorI1: i1, indicatorI2: i2 });
    }
  }
  return out;
}
