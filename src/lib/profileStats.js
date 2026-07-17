// AK-086 UI: achievements.js/badges.js'in beklediği "stats" nesnesini gerçek veriden türetir.
// Bu dosya achievements.js/badges.js/points.js'in İMZALARINI değiştirmez — yalnız onlara
// girdi hazırlar (D9: durum her zaman event log'dan/gerçek tablodan türetilir, asla fabrike).
//
// v1'DE WIRED OLMAYANLAR (points.js EARNING_TABLE'daki wired:false kalemleriyle AYNI ilke —
// ön koşul sistemi henüz yok, dürüstçe 0/boş döner, asla sahte kazandırılmaz):
//   activeInvites   — davet sahipliğini invite'a bağlayan sütun bu repo'nun bilinen şemasında yok
//                      (bkz. supabase.js: invites şemasında yalnız code/used_by kesin biliniyor).
//   helpfulMarks    — yorum/faydalı-işaret sistemi henüz yok.
//   lessonsDone     — ders tamamlama takip verisi henüz yok.
//   scenariosDone   — Replay Ligi henüz yok.
//   loginStreak     — giriş-günü takip tablosu henüz yok (sicil streak'i ile KARIŞTIRILMAZ, farklı kavram).
//   seasonBrier     — Tahmin Ligi "sezon" pencere tanımı henüz yok (badges.js kalibrasyon rozeti için).
//   disciplineDays  — "sert düşüş günü + sicil var + işlem yok" dedektörü henüz yok (badges.js disiplin rozeti için).
// memberIndex İSE wired: profiles.created_at üzerinden ucuz ve dürüst hesaplanabiliyor.
import { supabase, fetchStrategiesByUser, fetchProfilesByIds } from "./supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ================= saf fonksiyonlar (test edilir) =================

// Sicil (ledger.js trades) içindeki TÜM geçmişteki en uzun kesintisiz gün serisi.
// points.js'teki currentStreakDays yalnız GÜNCEL/son seriyi ölçer (o hâlâ kırılabilir);
// rozet/başarım "7/30 gün seri" bir kez kazanılıp KALICI kalmalı — o yüzden ayrı fonksiyon.
export function maxStreakDays(trades) {
  if (!trades || !trades.length) return 0;
  const days = [...new Set(trades.map((t) => new Date(t.d).toISOString().slice(0, 10)))].sort();
  let max = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / DAY_MS);
    if (diff === 1) { cur++; if (cur > max) max = cur; } else cur = 1;
  }
  return days.length ? max : 0;
}

export function verifiedStrategiesCount(strategies) {
  return (strategies || []).filter((s) => Number(s.oos_t) >= 2).length;
}

// K1: "Fikirler" sayacı v1 — ayrı bir "fikir postu" içerik tipi henüz yok (AK-090, v2).
// Doğrulanmış strateji + Tahmin Ligi katılımı toplamı dürüst bir vekildir, fabrike sayı DEĞİL.
export function ideasCount(verifiedStrategies, predictions) {
  return Math.max(0, verifiedStrategies || 0) + Math.max(0, predictions || 0);
}

export function profileComplete(profile) {
  return !!(profile?.handle && profile?.job);
}

// ================= Supabase I/O (D6: yapılandırılmamışsa/boşsa dürüst 0/boş — asla fabrike) =================

export async function fetchFollowCounts(userId) {
  if (!supabase || !userId) return { followers: 0, following: 0 };
  const [followers, following] = await Promise.all([
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers.count || 0, following: following.count || 0 };
}

// type: "followers" | "following" — handle listesi (K1 sayaç tıklama modalı).
export async function fetchFollowList(profileId, type) {
  if (!supabase || !profileId) return [];
  const matchCol = type === "followers" ? "following_id" : "follower_id";
  const idCol = type === "followers" ? "follower_id" : "following_id";
  const { data, error } = await supabase.from("follows").select(idCol).eq(matchCol, profileId);
  if (error || !data?.length) return [];
  const map = await fetchProfilesByIds(data.map((r) => r[idCol]));
  return Object.values(map).sort();
}

export async function fetchPredictionsCount(userId) {
  if (!supabase || !userId) return 0;
  const { count } = await supabase.from("predictions").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count || 0;
}

// Kayıt sırası (1-tabanlı) — "kendinden önce kaç profil oluşturuldu + 1". badges.js "kurucu" rozeti içindir.
export async function fetchMemberIndex(userId, createdAt) {
  if (!supabase || !userId || !createdAt) return null;
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).lte("created_at", createdAt);
  return count || null;
}

// K2 (Ben.jsx Başarımlar) + K3 (Profil.jsx rozet vitrini) için TEK toplu stats nesnesi —
// achievements.js/deriveProgress VE badges.js/deriveBadges aynı şekli bekler, tek fetch yeter.
// isOwner=false iken sicil-bazlı alanlar (D1: cihaz-içi veri, başkasının cihazından görülemez) 0 kalır.
export async function fetchProfileStats(profile, { isOwner = false, trades = [] } = {}) {
  if (!profile) return {};
  const [strategies, predictions, memberIndex] = await Promise.all([
    fetchStrategiesByUser(profile.id),
    fetchPredictionsCount(profile.id),
    fetchMemberIndex(profile.id, profile.created_at),
  ]);
  const verified = verifiedStrategiesCount(strategies);
  return {
    sicilCount: isOwner ? trades.length : 0,
    maxStreakDays: isOwner ? maxStreakDays(trades) : 0,
    verifiedStrategies: verified,
    predictions,
    ideas: ideasCount(verified, predictions),
    profileComplete: profileComplete(profile) ? 1 : 0,
    activeInvites: 0,
    helpfulMarks: 0,
    lessonsDone: 0,
    scenariosDone: 0,
    loginStreak: 0,
    seasonBrier: null,
    disciplineDays: 0,
    memberIndex,
  };
}
