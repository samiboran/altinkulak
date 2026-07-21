// AK-FVG-panel: "Code'a bağla" (Pine Alert Webhook) — ORTAK saf mantık.
// Bu modül Deno Edge Function'da (supabase/functions/izleme-webhook), tarayıcıda
// (Izleme.jsx/izlemeEntries.js) VE Node test ortamında (tests/motor.test.js) AYNI HALİYLE
// kullanılır — supabase-js/HTTP/Request/Response'a bağımlı DEĞİLDİR, yalnız standart JS +
// Web Crypto (crypto.getRandomValues) kullanır (üçünde de mevcuttur).
//
// KARAR (D16): processWebhookTrigger yalnız izleme_entries'in KENDİ durumunu günceller —
// deps arayüzü (findByToken/markTriggered) yapısal olarak başka bir tabloya erişim İMKANI
// vermez; trade/prediction/sandbox tablolarına yazmak bu fonksiyonun içinden mümkün değildir.

export const RATE_LIMIT_MS = 60 * 1000; // aynı token 1 dakika içinde tekrar tetiklenirse sessizce yut

// 12 random byte = 24 hex karakter (~96 bit) — migration'daki default ile aynı entropi düzeyi.
// Üretimde token DB tarafından (gen_random_bytes) üretilir; bu yalnızca dev/test/önizleme içindir.
export function generateWebhookToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// baseUrl: webhook endpoint'inin GERÇEK adresi (bkz. izlemeEntries.js — Supabase Functions
// URL'i; bu proje statik GitHub Pages'te barındığı için özel bir /webhook/izleme yolu YOKTUR,
// TradingView doğrudan Supabase'in fonksiyon adresine POST atar).
export function buildWebhookUrl(baseUrl, token) {
  if (!baseUrl || !token) return null;
  return `${String(baseUrl).replace(/\/+$/, "")}/${token}`;
}

// Son tetiklenmeden bu yana RATE_LIMIT_MS geçmediyse true (istek yutulmalı).
export function isRateLimited(lastTriggeredAt, now = Date.now()) {
  if (!lastTriggeredAt) return false;
  const last = lastTriggeredAt instanceof Date ? lastTriggeredAt.getTime() : new Date(lastTriggeredAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last < RATE_LIMIT_MS;
}

// Bir Pine alert POST'unu işler. DB/HTTP detayına dokunmaz — yalnız KARAR verir, okuma/yazma
// çağıranın (deps) sorumluluğundadır.
//   deps.findByToken(token) -> Promise<{ id, lastTriggeredAt } | null>
//   deps.markTriggered(id, { triggeredAt, rawBody }) -> Promise<void>
// Döner: { status: 404 }                      — token eşleşmedi
//        { status: 200, ignored: true }       — rate limit'e takıldı, sessizce yutuldu
//        { status: 200, ignored: false }      — durum güncellendi
export async function processWebhookTrigger(token, rawBody, deps, now = Date.now()) {
  if (!token || typeof token !== "string") return { status: 404 };
  const entry = await deps.findByToken(token);
  if (!entry) return { status: 404 };
  if (isRateLimited(entry.lastTriggeredAt, now)) return { status: 200, ignored: true };
  await deps.markTriggered(entry.id, { triggeredAt: new Date(now).toISOString(), rawBody: rawBody ?? null });
  return { status: 200, ignored: false };
}
