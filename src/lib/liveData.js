// AK-072: Binance kline WebSocket ile canlı mum akışı.
// Mimari: ilk yükleme REST (data.js/loadReal), sonrası bu modül WS ile son mumu tick'te
// günceller, kapanışta yeni mum ekler. Yalnızca gerçek-kaynaklı (kripto) semboller için.
import { pairFor, parseKlines } from "./data.js";

const WATCHDOG_MS = 45000;      // bu süre boyunca hiç mesaj gelmezse bağlantı ölü sayılır
const WATCHDOG_CHECK_MS = 10000;
const MAX_BACKOFF_MS = 30000;
const GAPFILL_LIMIT = 150;      // yeniden bağlanınca boşluğu doldurmak için son N mum

// Tek bir WS mesajındaki kline'ı (k) bar dizisine uygular — saf fonksiyon, test edilir.
// Açılış zamanı (time) son bardakiyle aynıysa o bar güncellenir (tick), farklıysa yeni bar eklenir.
export function applyTick(bars, k) {
  const barData = { time: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
  const last = bars[bars.length - 1];
  if (last && last.time === k.t) {
    return [...bars.slice(0, -1), { ...last, ...barData }];
  }
  return [...bars, { ...barData, t: bars.length }];
}

// Yeniden bağlanma sonrası REST'ten gelen taze barlarla boşluğu doldurur — saf fonksiyon, test edilir.
// freshBars'ın kapsadığı zaman aralığından ESKİ olan barlar korunur, geri kalan taze veriyle
// değiştirilir; t alanı (dizi indeksi) baştan sona yeniden numaralanır.
export function mergeGapFill(bars, freshBars) {
  if (!freshBars || !freshBars.length) return bars;
  const cutoff = freshBars[0].time;
  const kept = bars.filter(b => b.time < cutoff);
  return [...kept, ...freshBars].map((b, i) => ({ ...b, t: i }));
}

function gapFillUrls(pair, tf) {
  return [
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${tf}&limit=${GAPFILL_LIMIT}`,
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=${GAPFILL_LIMIT}`,
  ];
}

// subscribe(symbol, tf, initialBars, onUpdate) -> unsubscribe()
// initialBars: REST'ten gelen başlangıç barları (referans kopyalanır, dışarıdaki dizi mutasyona uğramaz).
// onUpdate(bars): her güncellenmiş bar dizisiyle çağrılır (rAF ile çağıran tarafta tamponlanması beklenir).
export function subscribe(symbol, tf, initialBars, onUpdate) {
  const sym = String(symbol).toUpperCase();
  const pair = pairFor(sym);
  if (!pair || typeof WebSocket === "undefined") return () => {}; // kripto değil ya da tarayıcı-dışı ortam

  let bars = initialBars || [];
  let ws = null;
  let closed = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let watchdogTimer = null;
  let lastMsgAt = Date.now();

  function emit() { if (!closed) onUpdate(bars); }

  async function gapFill() {
    for (const u of gapFillUrls(pair, tf)) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const raw = await r.json();
        if (!Array.isArray(raw) || !raw.length) continue;
        bars = mergeGapFill(bars, parseKlines(raw));
        emit();
        return;
      } catch { /* ağ hatası — sıradaki URL */ }
    }
  }

  function scheduleReconnect() {
    if (closed) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt++;
    reconnectTimer = setTimeout(async () => {
      if (closed) return;
      await gapFill(); // yeniden bağlanmadan önce kopukluk boşluğunu doldur
      if (!closed) connect();
    }, delay);
  }

  function connect() {
    const stream = `${pair.toLowerCase()}@kline_${tf}`;
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    ws.onopen = () => { reconnectAttempt = 0; lastMsgAt = Date.now(); };
    ws.onmessage = (e) => {
      lastMsgAt = Date.now();
      try {
        const msg = JSON.parse(e.data);
        if (!msg?.k) return;
        bars = applyTick(bars, msg.k);
        emit();
      } catch { /* bozuk mesaj — yok say */ }
    };
    ws.onclose = () => { if (!closed) scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch { /* zaten kapalı olabilir */ } };
  }

  // Tarayıcı native WebSocket ping/pong çerçevelerini otomatik (JS'e görünmez) yönetir;
  // burada uygulama katmanında "sessiz kopma" tespiti yapılır — belirli süre hiç mesaj
  // gelmezse bağlantı ölü sayılıp zorla kapatılır (onclose zinciri yeniden bağlanmayı tetikler).
  watchdogTimer = setInterval(() => {
    if (closed) return;
    if (Date.now() - lastMsgAt > WATCHDOG_MS) {
      try { ws && ws.close(); } catch { /* önemsiz */ }
    }
  }, WATCHDOG_CHECK_MS);

  connect();

  return function unsubscribe() {
    closed = true;
    clearTimeout(reconnectTimer);
    clearInterval(watchdogTimer);
    if (ws) { try { ws.close(); } catch { /* önemsiz */ } }
  };
}
