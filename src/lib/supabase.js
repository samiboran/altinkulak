import { createClient } from "@supabase/supabase-js";

// esbuild+Node altında (SSR duman testi) import.meta.env yok — güvenli düş.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

// .env henüz eklenmediyse client kurulmaz — sayfalar çökmeden "yapılandırılmamış" durumuna düşer.
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const NOT_CONFIGURED = { error: { message: "Supabase yapılandırılmamış — .env dosyasını ekle (bkz. .env.example)." } };

export async function signInWithEmail(email) {
  if (!supabase) return NOT_CONFIGURED;
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + env.BASE_URL },
  });
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
