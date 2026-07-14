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
function fibSideOk(price, fib, dir) {
  if (!fib) return false;
  var mid = (fib.hi + fib.lo) / 2;
  return dir === 1 ? price <= mid : price >= mid;
}
`;
}

function runnerScript() {
  return `
window.addEventListener("message", function (ev) {
  if (!ev.data || ev.data.type !== "ak-run") return;
  try {
    if (typeof mySignal !== "function") throw new Error("mySignal fonksiyonu bulunamadı (function mySignal(bars, helpers) {...} tanımlamalısınız).");
    var helpers = { ema: ema, atr: atr, rsi: rsi, findFib: findFib, fibSideOk: fibSideOk };
    var result = mySignal(ev.data.bars, helpers);
    parent.postMessage({ type: "ak-result", ok: true, result: result }, "*");
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

function buildSrcDoc(userCode) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>` +
    `<script>${blockedApiScript()}<\/script>` +
    `<script>${helpersScript()}<\/script>` +
    `<script>${escapeForScriptTag(userCode)}<\/script>` +
    `<script>${runnerScript()}<\/script>` +
    `</body></html>`;
}

// Kullanıcının kodunu (mySignal fonksiyonu) izole iframe'de çalıştırır.
// Döner: Promise<{ ok: boolean, result?: any, error?: string }>
export function runUserCode(code, bars) {
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
        try { iframe.contentWindow.postMessage({ type: "ak-run", bars }, "*"); }
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
      iframe.srcdoc = buildSrcDoc(code);
    } catch (e) {
      finish({ ok: false, error: "Sandbox oluşturulamadı: " + String(e) });
      return;
    }
    document.body.appendChild(iframe);
  });
}
