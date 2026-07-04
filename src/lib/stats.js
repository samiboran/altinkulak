// Istatistik cekirdegi — SweepLab mantiginin JS portu.
// Amac: "gozumuz kor olmasin" — bir edge gercek mi, tesaduf mu ayirmak.

// Ortalama
export function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

// Ornek standart sapma (n-1)
export function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

// Tek orneklem t-istatistigi: getiri ortalamasi 0'dan anlamli sekilde farkli mi?
// t = mean / (std / sqrt(n))
export function tStat(returns) {
  const n = returns.length;
  if (n < 2) return 0;
  const s = std(returns);
  if (s === 0) return 0;
  return mean(returns) / (s / Math.sqrt(n));
}

// 70/30 train/test bolme (siralama korunur — zaman serisi)
export function trainTestSplit(arr, ratio = 0.7) {
  const cut = Math.floor(arr.length * ratio);
  return { train: arr.slice(0, cut), test: arr.slice(cut) };
}

// Sharpe benzeri oran (yillik degil, islem bazli ham oran)
export function sharpeLike(returns) {
  const s = std(returns);
  return s === 0 ? 0 : mean(returns) / s;
}

// Rastgele kontrol grubu: ayni sayida islemi rastgele giris ile uret,
// dagilimin t-statini dondur. Gercek strateji bunu net asmali.
// Deterministik olmasi icin seed'li basit PRNG (mulberry32).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bar getirileri uzerinde rastgele "islem" sec, t-stat dagiliminin ozetini ver
export function randomControl(barReturns, tradeCount, runs = 200, seed = 12345) {
  if (barReturns.length === 0 || tradeCount === 0) return { meanT: 0, p95: 0 };
  const rnd = mulberry32(seed);
  const ts = [];
  for (let r = 0; r < runs; r++) {
    const picks = [];
    for (let i = 0; i < tradeCount; i++) {
      const idx = Math.floor(rnd() * barReturns.length);
      picks.push(barReturns[idx]);
    }
    ts.push(Math.abs(tStat(picks)));
  }
  ts.sort((a, b) => a - b);
  return {
    meanT: mean(ts),
    p95: ts[Math.floor(runs * 0.95)] || 0, // rastgelenin %95 esigi
  };
}

// Nihai yargi: strateji t-stati hem 2 esigini hem rastgele %95'i gecmeli
export function verdict(stratT, control) {  // Karli edge: t POZITIF ve >= 2 olmali (negatif t = kaybettiren duzen, "iyi" degil)
  const passAbsolute = stratT >= 2.0;
  const passControl = Math.abs(stratT) > control.p95;
  const good = passAbsolute && passControl;
  return {
    good,
    passAbsolute,
    passControl,
    reason: good
      ? "t ≥ 2 ve rastgele kontrol grubunu aşıyor: anlamlı, kârlı edge."
      : stratT < 0
        ? "t negatif: bu kurulum kâr değil zarar üretiyor."
        : !passAbsolute
          ? "t < 2: rastgeleden ayırt edilemiyor."
          : "t ≥ 2 ama rastgele kontrol grubunu aşamıyor: kuşkulu.",
  };
}

// --- Coklu-test duzeltmesi (Tarama icin) ---
// N sembol ayni anda taranirsa, hic edge olmasa bile sans eseri bazilari t>=2 gecer.
// Bonferroni: alpha'yi N'e boler, esigi yukseltir. "Sikimodun" matematigi.

// Ters normal CDF (Acklam yaklasimi) — p icin z dondurur
function invNorm(p) {
  if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// N test icin Bonferroni-duzeltilmis tek-yonlu t esigi (normal yaklasimla)
export function bonferroniT(nTests, alpha = 0.05) {
  if (!nTests || nTests < 1) return 2.0;
  const z = invNorm(1 - alpha / nTests);
  return Math.max(2.0, Math.round(z * 10) / 10); // 2'nin altina dusmez
}

// N testte, hic edge yokken sans eseri t>=2 gecmesi beklenen sembol sayisi (~tek yonlu %2.5-5)
export function expectedFalsePositives(nTests, alpha = 0.05) {
  return Math.round(nTests * alpha * 10) / 10;
}
