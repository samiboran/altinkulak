import { createClient } from "@supabase/supabase-js";

// esbuild+Node altında (SSR duman testi) import.meta.env yok — güvenli düş.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

// .env henüz eklenmediyse client kurulmaz — sayfalar çökmeden "yapılandırılmamış" durumuna düşer.
// AK-081/C1: oturum kalıcılığı açıkça sabitlenir — bir kez giren, çıkış yapana dek girişli kalır.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const NOT_CONFIGURED = { error: { message: "Supabase yapılandırılmamış — .env dosyasını ekle (bkz. .env.example)." } };

export async function signInWithEmail(email) {
  if (!supabase) return NOT_CONFIGURED;
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + env.BASE_URL },
  });
}

// AK-081/C1: magic link mail uygulamasının İÇ tarayıcısında açılınca oturum yanlış tarayıcıda
// doğuyor (Android/Gmail webview tuzağı). Maildeki 6 haneli kodu SİTEDE girmek bunu çözer.
export async function verifyEmailOtp(email, token) {
  if (!supabase) return NOT_CONFIGURED;
  return supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe() {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

// ================= AK-077: profiles/strategies/follows sorguları (Profil.jsx "vitrin") =================
// Supabase yapılandırılmamışsa ya da satır yoksa null/[]/false döner — çağıran taraf bunu
// "henüz doğrulanmış strateji yok" gibi dürüst boş durumlara çevirir. Asla mock/fabrike veri
// buradan sızmaz (D6).

export async function fetchProfileByHandle(handle) {
  if (!supabase || !handle) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("handle", handle).maybeSingle();
  if (error) return null;
  return data;
}

export async function fetchProfileById(id) {
  if (!supabase || !id) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data;
}

// Toplu handle çözümü — lig tablosu gibi çok kullanıcılı listelerde tek tek fetchProfileById
// çağırmak yerine (N+1) tek sorguda id->handle eşlemesi döner.
export async function fetchProfilesByIds(ids) {
  if (!supabase || !ids || !ids.length) return {};
  const { data, error } = await supabase.from("profiles").select("id, handle").in("id", ids);
  if (error) return {};
  return Object.fromEntries((data || []).map((p) => [p.id, p.handle]));
}

export async function fetchStrategiesByUser(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("strategies").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

export async function fetchFollowState(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return false;
  const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", followerId).eq("following_id", followingId).maybeSingle();
  return !!data;
}

export async function followUser(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return false;
  const { error } = await supabase.from("follows").insert({ follower_id: followerId, following_id: followingId });
  return !error;
}

export async function unfollowUser(followerId, followingId) {
  if (!supabase || !followerId || !followingId) return false;
  const { error } = await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  return !error;
}

// ================= AK-080-EXT: davet kodu + bekleme listesi (Giris.jsx) =================
// invites şeması bu repo'nun migration'ları DIŞINDA (Fable'ın schema.sql'i) Supabase'e zaten
// yüklendi — kesin bilinen alanlar: code (metin), used_by (uuid, null=kullanılmamış; görev
// talimatının kendisinden). Emin olunmayan ekstra sütunlara YAZILMAZ — var olmayan bir sütuna
// update göndermek isteğin tamamını başarısız kılar, minimum varsayım en güvenlisi.

export async function verifyInviteCode(code) {
  if (!supabase || !code) return { valid: false, error: "Kod gerekli." };
  const clean = code.trim().toUpperCase();
  const { data, error } = await supabase.from("invites").select("id, used_by").eq("code", clean).maybeSingle();
  if (error) return { valid: false, error: "Kod doğrulanamadı — tekrar dene." };
  if (!data) return { valid: false, error: "Bu davet kodu tanınmıyor." };
  if (data.used_by) return { valid: false, error: "Bu davet kodu zaten kullanılmış." };
  return { valid: true, inviteId: data.id };
}

// E-posta OTP doğrulanıp gerçek user.id elde edildikten SONRA çağrılır (Giris.jsx submitOtp).
// .is("used_by", null) yarış durumuna karşı korur — iki sekmede aynı kod eşzamanlı kullanılırsa yalnız ilki kazanır.
export async function redeemInviteCode(inviteId, userId) {
  if (!supabase || !inviteId || !userId) return false;
  const { error } = await supabase.from("invites").update({ used_by: userId }).eq("id", inviteId).is("used_by", null);
  return !error;
}

// Bekleme listesi — insert-only, kimlik doğrulama gerektirmez (henüz hesabı olmayan kişi katılır).
export async function joinWaitlist(email) {
  if (!supabase || !email) return { ok: false };
  const { error } = await supabase.from("waitlist").insert({ email: email.trim().toLowerCase() });
  if (error) {
    if (error.code === "23505") return { ok: true }; // zaten listede — kullanıcıya "başarılı" görünür, bilgi sızdırmaz
    return { ok: false };
  }
  return { ok: true };
}
