// AK-FVG-panel: "Code'a bağla" — izleme_entries için istemci tarafı Supabase katmanı.
// Diğer supabase.js sorguları gibi: yapılandırılmamışsa ya da satır yoksa dürüst boş değer
// döner (D6) — fabrike token/URL asla üretilmez.
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

// Kullanıcının bu sembol için var olan izleme_entries kaydı (yoksa null).
export async function fetchWebhookEntry(userId, sym) {
  if (!supabase || !userId || !sym) return null;
  const { data, error } = await supabase
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
// varsa mevcut kaydı döner. unique(user_id, sym) çakışmasında (23505) ikinci bir SELECT ile
// mevcut satır getirilir — iki sekmede aynı ana aynı anda tıklarsa yarış durumuna dayanıklı.
export async function getOrCreateWebhookEntry(userId, sym) {
  if (!supabase || !userId || !sym) return null;
  const s = String(sym).toUpperCase();
  const { data, error } = await supabase
    .from("izleme_entries").insert({ user_id: userId, sym: s }).select().single();
  if (!error) return data;
  if (error.code === "23505") return fetchWebhookEntry(userId, s);
  return null;
}
