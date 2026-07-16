// AK-078 D11: ABD hisse fiyatları SEMBOL BAŞINA merkezi cache — kullanıcı başına DEĞİL.
// Aynı sembolü gösteren birden fazla satır/bileşen aynı anda çağırsa bile tek ağ isteği gider
// (inFlight dedup) ve TTL süresi dolmadan tekrar sorulmaz (cache).
//
// GERÇEKÇİ KISIT: bu statik (GitHub Pages) bir SPA — sunucu tarafı çalışma zamanı yok. Bu yüzden
// "merkezi" cache burada TARAYICI SÜREÇİ seviyesinde (modül-level Map): aynı kullanıcının açtığı
// sayfadaki TÜM bileşenler tek isteği paylaşır, ama farklı kullanıcıların tarayıcıları arasında
// GERÇEK bir paylaşım yoktur (o, bir backend/edge function ister — v2, open_for_later). Bu, en
// azından "her satır kendi API çağrısını yapar" savurganlığını (asıl risk — ücretsiz plan limiti)
// ortadan kaldırır; dürüstçe "tam merkezi değil, oturum-içi merkezi" olarak belgelenir.
//
// API seçimi: Finnhub (/quote) — ücretsiz planda ~60 istek/dk, tek sembol = tek GET, ek parametre
// gerektirmiyor (Alpha Vantage günde ~25 istekle çok kısıtlı; Twelve Data günlük 800 ama karmaşık
// yanıt şeması ister). Anahtar .env'den okunur (VITE_FINNHUB_API_KEY) — yapılandırılmamışsa
// sessizce null döner, UI manuel fiyat girişine düşer (supabase.js'teki NOT_CONFIGURED örüntüsüyle aynı).
//
// U7: updateInterval HARDCODE edilmez, config'ten okunur — ileride plan bazlı hız farkı (free/paid)
// buradan kontrol edilecek. v1'de tek plan var (free), herkes aynı hızı görür.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
let apiKey = env.VITE_FINNHUB_API_KEY || "";
// Testler için — gerçek .env olmadan (Node'da import.meta.env yok) merkezi cache/dedup davranışını
// doğrulayabilmek için anahtarı ve fetch'i geçici olarak enjekte eder.
export function _setApiKeyForTests(key) { apiKey = key || ""; }

const config = {
  updateIntervalMs: 5 * 60 * 1000, // free tier hızı — plan sistemi eklenince setUpdateInterval ile değişir
};
export function setUpdateInterval(ms) {
  if (Number.isFinite(ms) && ms > 0) config.updateIntervalMs = ms;
}
export function getUpdateInterval() {
  return config.updateIntervalMs;
}

const cache = new Map();   // SEMBOL -> { price, ts }
const inFlight = new Map(); // SEMBOL -> Promise<number|null>  (aynı sembole eşzamanlı çağrılar TEK isteğe düşer)

async function fetchPrice(sym) {
  if (!apiKey) return null; // yapılandırılmamış — dürüstçe null, fabrike veri yok
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    return Number.isFinite(d?.c) && d.c > 0 ? d.c : null;
  } catch { return null; }
}

// Merkezi cache üzerinden fiyat okur. Cache TTL içindeyse ağa hiç çıkmaz; eşzamanlı iki çağrı
// aynı sembolü isterse ikisi de AYNI in-flight Promise'i paylaşır (tek istek).
export async function getUSStockPrice(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return null;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.ts < config.updateIntervalMs) return hit.price;
  if (inFlight.has(sym)) return inFlight.get(sym);

  const p = fetchPrice(sym).then((price) => {
    inFlight.delete(sym);
    if (price != null) { cache.set(sym, { price, ts: Date.now() }); return price; }
    return hit?.price ?? null; // ağ/anahtar hatası — eski (varsa) değeri koru, yoksa null
  }).catch(() => { inFlight.delete(sym); return hit?.price ?? null; });
  inFlight.set(sym, p);
  return p;
}

// Ağa çıkmadan, o an bellekte olanı okur (senkron) — UI ilk render'da "yükleniyor" yerine
// bir önceki bilinen değeri göstermek isterse kullanılır.
export function getCachedUSStockPrice(symbol) {
  return cache.get(String(symbol || "").trim().toUpperCase())?.price ?? null;
}

// D16: fiyatın yanında HER ZAMAN "son güncelleme: X dk önce" gösterilir — kaynak, cache'in KENDİ
// çekilme anıdır (kullanıcının sayfayı açtığı an DEĞİL). Cache 4dk önce yenilendiyse herkes "4 dk
// önce" görür; sayfa yenilense de bu değişmez (yeniden fetch tetiklemez, salt okur).
export function getUSStockPriceTimestamp(symbol) {
  return cache.get(String(symbol || "").trim().toUpperCase())?.ts ?? null;
}

export function isUSStockPriceConfigured() {
  return !!apiKey;
}

// Testler için — modül-level cache'i sıfırlar.
export function _resetCacheForTests() {
  cache.clear();
  inFlight.clear();
}
