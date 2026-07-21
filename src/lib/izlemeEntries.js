// AK-FVG-panel: "Code'a bağla" — izleme_entries için istemci tarafı Supabase katmanı.
// Diğer supabase.js sorguları gibi: yapılandırılmamışsa ya da satır yoksa dürüst boş değer
// döner (D6) — fabrike token/URL asla üretilmez.
//
// AK-webhook-teşhis-2: eskiden HERHANGİ bir insert hatası (RLS, foreign key, eksik kolon...)
// sessizce null'a düşüyordu — UI hep aynı belirsiz "Bağlantı oluşturulamadı" mesajını
// gösteriyordu. Artık gerçek hata (varsa) describeSupabaseError ile kategorize edilip
// döndürülür — çağıran (Izleme.jsx) bunu doğrudan gösterebilir.
//
// client parametresi (supabase-js istemcisi) DI ile enjekte edilir — üretimde varsayılan
// gerçek supabase client'ıdır, testler kendi sahte istemcisini vererek insert/conflict/hata
// dallarını gerçek ağ olmadan doğrular.
import { supabase } from "./supabase.js";
import { buildWebhookUrl } from "./izlemeWebhookCore.js";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
// Bu proje statik GitHub Pages'te barındığı için özel bir /webhook/izleme yolu kuramaz —
// TradingView alert'i doğrudan Supabase Edge Function adresine POST atar.
const FUNCTIONS_BASE = env.VITE_SUPABASE_URL
  ? `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/izleme-webhook`
  : "";

// token biliniyorsa gösterilecek URL'i üretir; Supabase yapılandırılmamışsa null (D6).
export function webhookUrlFor(token) {
  if (!token || !FUNCTIONS_BASE) return null;
  return buildWebhookUrl(FUNCTIONS_BASE, token);
}

// Postgres/PostgREST hata kodunu kullanıcının anlayacağı bir cümleye çevirir. Bilinmeyen bir
// kod için bile "tekrar dene" gibi belirsiz bir şeye DÜŞMEZ — elimizdeki gerçek mesajı gösterir.
export function describeSupabaseError(error) {
  if (!error) return null;
  switch (error.code) {
    case "23503": // foreign key ihlali
      return "Hesabınla ilgili bir kurulum eksikliği var (foreign key ihlali) — çıkış yapıp tekrar giriş dene; sorun sürerse bize bildir.";
    case "42501": // RLS / yetkisiz
      return "Yetkisiz işlem (RLS) — oturumun sona ermiş olabilir, tekrar giriş yap.";
    case "42P01": // relation does not exist
    case "42703": // column does not exist
      return "Sunucu tarafı henüz kurulmamış (eksik migration) — bize bildir.";
    default:
      return error.message ? `Bağlantı oluşturulamadı: ${error.message}` : "Bağlantı oluşturulamadı — tekrar dene.";
  }
}

function defaultClient() { return supabase; }

// Kullanıcının bu sembol için var olan izleme_entries kaydı (yoksa null).
export async function fetchWebhookEntry(userId, sym, client = defaultClient()) {
  if (!client || !userId || !sym) return null;
  const { data, error } = await client
    .from("izleme_entries").select("*")
    .eq("user_id", userId).eq("sym", String(sym).toUpperCase())
    .maybeSingle();
  if (error) return null;
  return data;
}

// AK-102: kullanıcının TÜM tetiklenmiş Pine Code webhook'ları — "Pine Code Tetiklenmeleri"
// bölümü için (Alarm Geçmişi'nden AYRI kaynak: platformun kendi Avcı kuralı değil, kullanıcının
// KENDİ TradingView alert'i). En son tetiklenen en üstte.
export async function listTriggeredWebhookEntries(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("izleme_entries").select("*")
    .eq("user_id", userId).eq("webhook_status", "tetiklendi")
    .order("last_triggered_at", { ascending: false });
  if (error) return [];
  return data || [];
}

// Yoksa oluşturur (token/status DB tarafında üretilir — bkz. 010_izleme_webhook.sql default'ları),
// varsa mevcut kaydı döner (AYNI token — yeniden üretilmez). unique(user_id, sym) çakışmasında
// (23505) ikinci bir SELECT ile mevcut satır getirilir — iki sekmede aynı ana aynı anda tıklarsa
// yarış durumuna dayanıklı. Döner: { entry, error } — error yalnız entry null iken anlamlıdır.
export async function getOrCreateWebhookEntry(userId, sym, client = defaultClient()) {
  if (!client) return { entry: null, error: "Sunucu bağlantısı yapılandırılmamış." };
  if (!userId || !sym) return { entry: null, error: null }; // ön koşul eksik — sessizce hiçbir şey yapma (D6: giriş/sembol yoksa hata değil)
  const s = String(sym).toUpperCase();
  const { data, error } = await client
    .from("izleme_entries").insert({ user_id: userId, sym: s }).select().single();
  if (!error) return { entry: data, error: null };
  if (error.code === "23505") {
    const existing = await fetchWebhookEntry(userId, s, client);
    return existing ? { entry: existing, error: null } : { entry: null, error: describeSupabaseError(error) };
  }
  return { entry: null, error: describeSupabaseError(error) };
}
