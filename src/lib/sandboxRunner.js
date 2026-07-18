// AK-065: kullanıcı kodunu izole bir alanda çalıştırır.
// GÜVENLİK İLKESİ: ana thread'de ASLA eval()/new Function() kullanılmaz. Tüm kullanıcı kodu
// sandbox="allow-scripts" (allow-same-origin YOK, allow-popups YOK, allow-forms YOK) bir iframe
// içinde, opak (null) origin ile çalışır — tarayıcı bu izolasyonu kendisi zorunlu kılar (parent'ın
// DOM'una/localStorage'ına erişemez). Buna EK olarak iframe içinde de fetch/XHR/WebSocket/storage
// API'leri devre dışı bırakılır ki opak origin'den dahi dış dünyaya veri sızdırılamasın.
const TIMEOUT_MS = 3000;

function blockedApiScript() {
  // Bu string iframe içinde ayrı bir <script> olarak çalışır — kullanıcı kodundan ÖNCE.
  return `
"use strict";
function ak_blocked(name) {
  return function () { throw new Error(name + " sandbox içinde devre dışı bırakıldı."); };
}
try { window.fetch = ak_blocked("fetch"); } catch (e) {}
try { window.XMLHttpRequest = ak_blocked("XMLHttpRequest"); } catch (e) {}
try { window.WebSocket = ak_blocked("WebSocket"); } catch (e) {}
try { window.Worker = ak_blocked("Worker"); } catch (e) {}
try { window.sendBeacon = ak_blocked("sendBeacon"); } catch (e) {}
try { Object.defineProperty(window, "localStorage", { get: function () { throw new Error("localStorage sandbox içinde devre dışı bırakıldı."); }, configurable: true }); } catch (e) {}
try { Object.defineProperty(window, "sessionStorage", { get: function () { throw new Error("sessionStorage sandbox içinde devre dışı bırakıldı."); }, configurable: true }); } catch (e) {}
try { Object.defineProperty(window, "indexedDB", { get: function () { throw new Error("indexedDB sandbox içinde devre dışı bırakıldı."); }, configurable: true }); } catch (e) {}
try { Object.defineProperty(document, "cookie", { get: function () { throw new Error("document.cookie sandbox içinde devre dışı bırakıldı."); }, set: function () { throw new Error("document.cookie sandbox içinde devre dışı bırakıldı."); }, configurable: true }); } catch (e) {}

// Sözdizimi/çalışma-anı hatalarını (kullanıcı script'i parse edilemezse bile) hemen parent'a bildir.
window.onerror = function (msg, src, line, col, err) {
  try { parent.postMessage({ type: "ak-result", ok: false, error: "Kod hatası: " + msg + (line ? " (satır " + line + ")" : "") }, "*"); } catch (e) {}
  return true;
};
`;
}

// detectors.js'in salt-okunur, metin kopyası — modül sistemi olmadığı için (srcdoc ayrı bir belge)
// import edilemez, aynı mantık burada yeniden yazılır. Kaynak fonksiyonlarla birebir aynı davranır.
// AK-084/087: Strateji Çıkarıcı'nın (codegen.js) ürettiği kod h.findSweep/h.findFVG/h.inOTE/
// h.findCandlePatterns/h.ema gibi TÜM detectors.js fonksiyonlarını çağırır — bu liste eskiden
// (AK-065) yalnız atr/ema/rsi/findFib/fibSideOk içeriyordu, codegen'in ürettiği kod sandbox'ta
// "h.findSweep is not a function" ile patlardı. Kaynakla (src/lib/detectors.js) birebir senkron
// tutulmalı — testler (tests/motor.test.js) ikisini karşılaştırarak sapma yakalar.
function helpersScript() {
  return `
function atr(bars, period) {
  period = period || 14;
  var tr = [];
  for (var i = 1; i < bars.length; i++) {
    var h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  var out = new Array(bars.length).fill(null);
  for (var j = period; j <= tr.length; j++) {
    var s = tr.slice(j - period, j);
    out[j] = s.reduce(function (a, x) { return a + x; }, 0) / period;
  }
  return out;
}
function ema(bars, period) {
  period = period || 20;
  var k = 2 / (period + 1);
  var e = bars[0].c;
  return bars.map(function (b, i) { return (e = i ? b.c * k + e * (1 - k) : b.c); });
}
function rsi(bars, period) {
  period = period || 14;
  var out = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  var gainSum = 0, lossSum = 0;
  for (var i = 1; i <= period; i++) {
    var diff = bars[i].c - bars[i - 1].c;
    if (diff > 0) gainSum += diff; else lossSum += -diff;
  }
  var avgGain = gainSum / period, avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (var j = period + 1; j < bars.length; j++) {
    var d2 = bars[j].c - bars[j - 1].c;
    var gain = d2 > 0 ? d2 : 0, loss = d2 < 0 ? -d2 : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[j] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
function findFVG(bars, maxGapATR) {
  maxGapATR = maxGapATR == null ? 0.6 : maxGapATR;
  var a = atr(bars), out = [];
  for (var i = 2; i < bars.length; i++) {
    if (!a[i]) continue;
    if (bars[i - 2].h < bars[i].l) {
      var gap = bars[i].l - bars[i - 2].h;
      if (gap > 0 && gap < a[i] * maxGapATR) out.push({ i: i, dir: 1, lo: bars[i - 2].h, hi: bars[i].l });
    } else if (bars[i - 2].l > bars[i].h) {
      var gap2 = bars[i - 2].l - bars[i].h;
      if (gap2 > 0 && gap2 < a[i] * maxGapATR) out.push({ i: i, dir: -1, lo: bars[i].h, hi: bars[i - 2].l });
    }
  }
  return out;
}
function findOrderBlocks(bars) {
  var out = [];
  for (var i = 3; i < bars.length - 1; i++) {
    if (bars[i].c > bars[i].o * 1.015 && bars[i - 1].c < bars[i - 1].o) {
      out.push({ i: i - 1, lo: bars[i - 1].l, hi: bars[i - 1].o });
    }
  }
  return out.slice(-8);
}
function findBOS(bars) {
  var out = [];
  for (var i = 6; i < bars.length; i++) {
    var win = bars.slice(i - 6, i - 1);
    var prevHigh = -Infinity;
    for (var k = 0; k < win.length; k++) if (win[k].h > prevHigh) prevHigh = win[k].h;
    if (bars[i].c > prevHigh) out.push({ i: i, price: prevHigh });
  }
  return out.slice(-6);
}
function isNearOB(price, obs, tol) {
  for (var k = 0; k < obs.length; k++) { var o = obs[k]; if (price >= o.lo - tol && price <= o.hi + tol) return true; }
  return false;
}
function trendArr(bars, period, look) {
  period = period || 50; look = look || 5;
  var e = ema(bars, period);
  var out = new Array(bars.length).fill(0);
  for (var i = look; i < bars.length; i++) {
    if (e[i] == null || e[i - look] == null) continue;
    out[i] = e[i] > e[i - look] ? 1 : -1;
  }
  return out;
}
function findMitigation(bars) {
  var obs = findOrderBlocks(bars);
  var out = [];
  for (var k = 0; k < obs.length; k++) {
    var o = obs[k];
    for (var j = o.i + 3; j < Math.min(o.i + 50, bars.length); j++) {
      if (bars[j].l <= o.hi && bars[j].h >= o.lo) { out.push({ i: j, lo: o.lo, hi: o.hi, price: (o.lo + o.hi) / 2 }); break; }
    }
  }
  return out.slice(-8);
}
function orderFlowArr(bars, k) {
  k = k || 5;
  var out = new Array(bars.length).fill(0);
  for (var i = k; i < bars.length; i++) {
    var s = 0; for (var j = i - k + 1; j <= i; j++) s += bars[j].c - bars[j].o;
    out[i] = s > 0 ? 1 : s < 0 ? -1 : 0;
  }
  return out;
}
function findFib(bars, lookback) {
  lookback = lookback || 60;
  var seg = bars.slice(-lookback);
  if (seg.length < 5) return null;
  var hiI = 0, loI = 0;
  seg.forEach(function (b, i) { if (b.h > seg[hiI].h) hiI = i; if (b.l < seg[loI].l) loI = i; });
  var hi = seg[hiI].h, lo = seg[loI].l, rg = hi - lo || 1;
  var up = loI < hiI;
  var ratios = [0.5, 0.618, 0.705, 0.786];
  var levels = ratios.map(function (r) { return { r: r, price: up ? hi - rg * r : lo + rg * r }; });
  return { hi: hi, lo: lo, up: up, levels: levels, ote: { a: up ? hi - rg * 0.786 : lo + rg * 0.5, b: up ? hi - rg * 0.5 : lo + rg * 0.786 } };
}
function inOTE(price, fib) {
  if (!fib) return false;
  var lo = Math.min(fib.ote.a, fib.ote.b), hi = Math.max(fib.ote.a, fib.ote.b);
  return price >= lo && price <= hi;
}
function fibSideOk(price, fib, dir) {
  if (!fib) return false;
  var mid = (fib.hi + fib.lo) / 2;
  return dir === 1 ? price <= mid : price >= mid;
}
function ak_body(b) { return Math.abs(b.c - b.o); }
function ak_range(b) { return b.h - b.l; }
function ak_upperWick(b) { return b.h - Math.max(b.o, b.c); }
function ak_lowerWick(b) { return Math.min(b.o, b.c) - b.l; }
function isEngulfing(bars, i) {
  if (i < 1) return 0;
  var p = bars[i - 1], b = bars[i];
  if (ak_body(b) === 0 || ak_body(p) === 0) return 0;
  var bullPrev = p.c < p.o, bullNow = b.c > b.o;
  var engulf = Math.max(b.o, b.c) >= Math.max(p.o, p.c) && Math.min(b.o, b.c) <= Math.min(p.o, p.c);
  if (!engulf) return 0;
  if (bullPrev && bullNow) return 1;
  if (!bullPrev && !bullNow) return -1;
  return 0;
}
function isPinBar(bars, i, k, oppFrac) {
  k = k == null ? 2 : k; oppFrac = oppFrac == null ? 0.25 : oppFrac;
  var b = bars[i], r = ak_range(b);
  if (r === 0) return 0;
  var bd = ak_body(b), up = ak_upperWick(b), lo = ak_lowerWick(b);
  if (lo >= k * Math.max(bd, r * 0.05) && up <= r * oppFrac) return 1;
  if (up >= k * Math.max(bd, r * 0.05) && lo <= r * oppFrac) return -1;
  return 0;
}
function isDoji(bars, i, maxBodyFrac) {
  maxBodyFrac = maxBodyFrac == null ? 0.1 : maxBodyFrac;
  var b = bars[i], r = ak_range(b);
  if (r === 0) return 0;
  return ak_body(b) <= r * maxBodyFrac ? 1 : 0;
}
function isInsideBar(bars, i) {
  if (i < 1) return 0;
  var p = bars[i - 1], b = bars[i];
  return b.h <= p.h && b.l >= p.l ? 1 : 0;
}
function isMarubozu(bars, i, minBodyFrac) {
  minBodyFrac = minBodyFrac == null ? 0.9 : minBodyFrac;
  var b = bars[i], r = ak_range(b);
  if (r === 0) return 0;
  if (ak_body(b) < r * minBodyFrac) return 0;
  return b.c > b.o ? 1 : -1;
}
function findCandlePatterns(bars, from, to) {
  from = from == null ? 0 : from; to = to == null ? bars.length - 1 : to;
  var out = [];
  var lo = Math.max(0, from), hi = Math.min(bars.length - 1, to);
  for (var i = lo; i <= hi; i++) {
    var d;
    if ((d = isEngulfing(bars, i))) out.push({ i: i, dir: d, type: "engulfing" });
    if ((d = isPinBar(bars, i))) out.push({ i: i, dir: d, type: "pinbar" });
    if (isDoji(bars, i)) out.push({ i: i, dir: 0, type: "doji" });
    if (isInsideBar(bars, i)) out.push({ i: i, dir: 0, type: "insidebar" });
    if ((d = isMarubozu(bars, i))) out.push({ i: i, dir: d, type: "marubozu" });
  }
  return out;
}
function findEmaCross(bars, fast, slow) {
  fast = fast || 50; slow = slow || 200;
  var f = ema(bars, fast), s = ema(bars, slow);
  var out = [];
  for (var i = 1; i < bars.length; i++) {
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) out.push({ i: i, dir: 1, type: "golden_cross" });
    else if (f[i - 1] >= s[i - 1] && f[i] < s[i]) out.push({ i: i, dir: -1, type: "death_cross" });
  }
  return out;
}
function findSupportResistance(bars, swingWin, tolATR) {
  swingWin = swingWin || 5; tolATR = tolATR == null ? 0.5 : tolATR;
  if (bars.length < swingWin * 2 + 1) return [];
  var a = atr(bars, 14);
  var pivots = [];
  for (var i = swingWin; i < bars.length - swingWin; i++) {
    var win = bars.slice(i - swingWin, i + swingWin + 1);
    var maxH = -Infinity, minL = Infinity;
    for (var k = 0; k < win.length; k++) { if (win[k].h > maxH) maxH = win[k].h; if (win[k].l < minL) minL = win[k].l; }
    if (bars[i].h === maxH) pivots.push({ i: i, price: bars[i].h, side: "res" });
    if (bars[i].l === minL) pivots.push({ i: i, price: bars[i].l, side: "sup" });
  }
  var levels = [];
  for (var p = 0; p < pivots.length; p++) {
    var pv = pivots[p];
    var tol = (a[pv.i] || a[a.length - 1] || 0) * tolATR;
    var hit = null;
    for (var L = 0; L < levels.length; L++) { if (Math.abs(levels[L].price - pv.price) <= tol && levels[L].side === pv.side) { hit = levels[L]; break; } }
    if (hit) { hit.touches++; hit.price = (hit.price * (hit.touches - 1) + pv.price) / hit.touches; hit.lastI = pv.i; }
    else levels.push({ price: pv.price, side: pv.side, touches: 1, lastI: pv.i });
  }
  return levels.filter(function (L) { return L.touches >= 2; }).sort(function (x, y) { return y.touches - x.touches; });
}
function findSweep(bars, lookback, minPct, maxPct) {
  lookback = lookback || 20; minPct = minPct == null ? 0.0004 : minPct; maxPct = maxPct == null ? 0.0035 : maxPct;
  var out = [];
  for (var i = lookback; i < bars.length; i++) {
    var hi = -Infinity, lo = Infinity;
    for (var j = i - lookback; j < i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
    var b = bars[i];
    var altPct = (lo - b.l) / lo;
    if (b.l < lo && altPct >= minPct && altPct <= maxPct && b.c > lo) out.push({ i: i, dir: 1, type: "sweep_low", level: lo, pct: altPct });
    var ustPct = (b.h - hi) / hi;
    if (b.h > hi && ustPct >= minPct && ustPct <= maxPct && b.c < hi) out.push({ i: i, dir: -1, type: "sweep_high", level: hi, pct: ustPct });
  }
  return out;
}
`;
}

// AK-084/S3: extractParams(code) sonucu (parent tarafta hesaplanır) mesajla geçirilir, helpers.params
// olarak sunulur — hem "const PARAMS" global (aynı script scope) HEM helpers.params ile erişilebilir,
// kullanıcı hangi stille yazdıysa çalışsın.
function runnerScript() {
  return `
window.addEventListener("message", function (ev) {
  if (!ev.data || ev.data.type !== "ak-run") return;
  try {
    if (typeof mySignal !== "function") throw new Error("mySignal fonksiyonu bulunamadı (function mySignal(bars, helpers) {...} tanımlamalısınız).");
    var helpers = {
      ema: ema, atr: atr, rsi: rsi, findFib: findFib, fibSideOk: fibSideOk, inOTE: inOTE,
      findFVG: findFVG, findOrderBlocks: findOrderBlocks, findBOS: findBOS, findMitigation: findMitigation,
      orderFlowArr: orderFlowArr, trendArr: trendArr, isNearOB: isNearOB,
      findCandlePatterns: findCandlePatterns, findEmaCross: findEmaCross,
      findSupportResistance: findSupportResistance, findSweep: findSweep,
      params: ev.data.params || {},
    };
    var result = mySignal(ev.data.bars, helpers);
    parent.postMessage({ type: "ak-result", ok: true, result: result }, "*");
  } catch (err) {
    parent.postMessage({ type: "ak-result", ok: false, error: String((err && err.message) || err) }, "*");
  }
});
parent.postMessage({ type: "ak-ready" }, "*");
`;
}

// AK-084/C5-C6: Strateji Çıkarıcı'nın ürettiği mySignal(bars,helpers) tek bar-aralığını (i =
// bars.length-1) kontrol edip tek sinyal/null döner (bkz. codegen.js) — walk-forward test için
// AYNI iframe/script scope İÇİNDE (yeni iframe açmadan, çok daha hızlı) i=warmup..bars.length-1
// arası her adımda mySignal(bars.slice(0,i+1), helpers) çağrılır, null-olmayanlar dizide toplanır.
// Sandbox izolasyonu (allow-scripts, blocked API'ler) BİREBİR AYNI kalır — yalnız runner scripti farklı.
function walkForwardRunnerScript(warmup) {
  return `
window.addEventListener("message", function (ev) {
  if (!ev.data || ev.data.type !== "ak-run") return;
  try {
    if (typeof mySignal !== "function") throw new Error("mySignal fonksiyonu bulunamadı (function mySignal(bars, helpers) {...} tanımlamalısınız).");
    var helpers = {
      ema: ema, atr: atr, rsi: rsi, findFib: findFib, fibSideOk: fibSideOk, inOTE: inOTE,
      findFVG: findFVG, findOrderBlocks: findOrderBlocks, findBOS: findBOS, findMitigation: findMitigation,
      orderFlowArr: orderFlowArr, trendArr: trendArr, isNearOB: isNearOB,
      findCandlePatterns: findCandlePatterns, findEmaCross: findEmaCross,
      findSupportResistance: findSupportResistance, findSweep: findSweep,
      params: ev.data.params || {},
    };
    var bars = ev.data.bars;
    var warmup = ${JSON.stringify(warmup)};
    var out = [];
    for (var i = warmup; i < bars.length; i++) {
      var sig = mySignal(bars.slice(0, i + 1), helpers);
      if (sig && typeof sig === "object") {
        if (sig.i == null) sig.i = i;
        out.push(sig);
      }
    }
    parent.postMessage({ type: "ak-result", ok: true, result: out }, "*");
  } catch (err) {
    parent.postMessage({ type: "ak-result", ok: false, error: String((err && err.message) || err) }, "*");
  }
});
parent.postMessage({ type: "ak-ready" }, "*");
`;
}

// HTML ayrıştırıcısı "</script" dizisini görünce script bloğunu erkenden kapatır — kullanıcı
// kodu içinde (yorum/metin olarak dahi) geçerse yapıyı bozmasın diye kaçışlanır.
function escapeForScriptTag(code) {
  return String(code).replace(/<\/script/gi, "<\\/script");
}

function buildSrcDoc(userCode, runner) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>` +
    `<script>${blockedApiScript()}<\/script>` +
    `<script>${helpersScript()}<\/script>` +
    `<script>${escapeForScriptTag(userCode)}<\/script>` +
    `<script>${runner}<\/script>` +
    `</body></html>`;
}

// Ortak çalıştırma iskeleti — tek çağrı (runUserCode) ve walk-forward (runUserCodeWalkForward)
// arasında yalnız runner script'i ve postMessage'a eklenen alanlar değişir.
function execute(code, bars, runner, extra) {
  return new Promise((resolve) => {
    let settled = false;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";

    function cleanup() {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
    function finish(payload) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    }
    function onMessage(ev) {
      if (ev.source !== iframe.contentWindow || !ev.data) return;
      if (ev.data.type === "ak-ready") {
        try { iframe.contentWindow.postMessage({ type: "ak-run", bars, ...extra }, "*"); }
        catch (e) { finish({ ok: false, error: "Barlar sandbox'a gönderilemedi: " + String(e) }); }
        return;
      }
      if (ev.data.type === "ak-result") {
        finish({ ok: !!ev.data.ok, result: ev.data.result, error: ev.data.error });
      }
    }
    window.addEventListener("message", onMessage);

    // AK-065: 3sn içinde sonuç gelmezse (örn. while(true){} donma) iframe yok edilir — ana sayfa donmaz.
    const timer = setTimeout(() => {
      finish({ ok: false, error: "Kodun çalışması 3 saniyeyi aştı — durduruldu." });
    }, TIMEOUT_MS);

    try {
      iframe.srcdoc = buildSrcDoc(code, runner);
    } catch (e) {
      finish({ ok: false, error: "Sandbox oluşturulamadı: " + String(e) });
      return;
    }
    document.body.appendChild(iframe);
  });
}

// Kullanıcının kodunu (mySignal fonksiyonu) izole iframe'de TEK ÇAĞRIYLA çalıştırır — array-return
// stili (mySignal(bars,helpers) tüm bars'ı tarar, sinyal dizisi döner; TEMPLATE ve Basit Mod bu stilde).
// params: paramsBlock.js'in extractParams(code) çıktısı — helpers.params olarak sunulur (AK-084/S3).
// Döner: Promise<{ ok: boolean, result?: any, error?: string }>
export function runUserCode(code, bars, params = null) {
  return execute(code, bars, runnerScript(), { params });
}

// AK-084/C5: Strateji Çıkarıcı (codegen.js) çıktısı gibi "yalnız son barı kontrol eden" mySignal'leri
// bars.length'e kadar TÜM geçmişte yürütür (aynı iframe içinde, tek instantiation — performans).
// warmup: ilk kaç bar atlanır (codegen.js'in "i<60 return null" ısınmasıyla tutarlı varsayılan 60).
export function runUserCodeWalkForward(code, bars, params = null, warmup = 60) {
  return execute(code, bars, walkForwardRunnerScript(warmup), { params });
}
