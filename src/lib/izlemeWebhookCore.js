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

// AK-webhook-teşhis: TradingView alert mesajı tipik olarak birkaç yüz karakteri geçmez (TradingView'ın
// kendi alert mesajı sınırı da ~4000 karakterdir) — 8000 byte cömert bir tavan. Önceki başarısızlık
// ("fazla satır girildi" gibi bir sebep, gerçek log görülemeden teyit edilemedi — bkz. commit notu)
// hiçbir yerde İZ BIRAKMIYORDU: eşleşme/oran-sınırı dışında kalan HER ret sessizce kayboluyordu.
// Artık boyut sınırı AÇIKÇA kontrol edilir ve (token eşleşiyorsa) kayda geçirilir — bir daha "sebep
// belirsiz" durumuna düşülmesin diye.
export const MAX_PAYLOAD_BYTES = 8000;

export function isPayloadTooLarge(rawBody) {
  if (!rawBody) return false;
  return new TextEncoder().encode(String(rawBody)).length > MAX_PAYLOAD_BYTES;
}

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
//   deps.markFailed(id, { failedAt, reason }) -> Promise<void>  — REDDİN İZİNİ bırakır (D6/D14:
//     sessiz başarısızlık yok; sebep her zaman izleme_entries'te ve dolayısıyla UI'da görünür).
// Döner: { status: 404 }                                — token eşleşmedi (kayda geçecek entry yok)
//        { status: 413, reason: "payload_too_large" }   — payload MAX_PAYLOAD_BYTES'ı aştı, kayda geçti
//        { status: 200, ignored: true }                 — rate limit'e takıldı, sessizce yutuldu
//        { status: 200, ignored: false }                — durum güncellendi
export async function processWebhookTrigger(token, rawBody, deps, now = Date.now()) {
  if (!token || typeof token !== "string") return { status: 404 };
  const entry = await deps.findByToken(token);
  if (!entry) return { status: 404 };
  if (isPayloadTooLarge(rawBody)) {
    await deps.markFailed(entry.id, { failedAt: new Date(now).toISOString(), reason: "payload_too_large" });
    return { status: 413, reason: "payload_too_large" };
  }
  if (isRateLimited(entry.lastTriggeredAt, now)) return { status: 200, ignored: true };
  await deps.markTriggered(entry.id, { triggeredAt: new Date(now).toISOString(), rawBody: rawBody ?? null });
  return { status: 200, ignored: false };
}
