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
