// AK-083: Tahmin Ligi — veri katmanı. Skorlama brier.js'te (buraya taşınmaz, import edilir).
// Şema: supabase/migrations/003_predictions.sql (prediction_questions + predictions).
// Supabase yapılandırılmamışsa ya da satır yoksa sessizce boş/null döner — asla fabrike veri (D6).
import { supabase } from "./supabase.js";

// ================= saf fonksiyonlar (test edilir — Supabase'e bağımlı değil) =================

// Ham predictions satırı (question join'li) -> brier.js'in beklediği {confidence, hit} şekli.
// Yalnız ÇÖZÜLMÜŞ sorular sayılır (hit tanımsızken puanlamak anlamsız).
export function toBrierRows(rawRows) {
  return (rawRows || [])
    .filter((r) => r?.question?.resolved && r.question.outcome)
    .map((r) => ({
      userId: r.user_id,
      confidence: Number(r.confidence),
      hit: r.direction === r.question.outcome,
    }));
}

// Lig tablosu brier.js.leaderboard()'a girdi: [{userId, preds}]
export function groupByUser(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!map.has(r.userId)) map.set(r.userId, []);
    map.get(r.userId).push(r);
  }
  return [...map.entries()].map(([userId, preds]) => ({ userId, preds }));
}

// ================= Supabase I/O =================

// Şu an kilitlenebilir tek soru: çözülmemiş + kapanışı henüz gelmemiş, en yenisi.
export async function fetchActiveQuestion() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("prediction_questions")
    .select("*")
    .eq("resolved", false)
    .gt("closes_at", new Date().toISOString())
    .order("opens_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Son N çözülmüş soru (arşiv/bağlam için — lig tablosu ayrıca tüm zamanları kapsar).
export async function fetchResolvedQuestions(limit = 10) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("prediction_questions")
    .select("*")
    .eq("resolved", true)
    .order("closes_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// Kullanıcının belirli bir soru için kilitlediği tahmin (varsa) — "tahminin kilitli" durumu için.
export async function fetchMyPrediction(questionId, userId) {
  if (!supabase || !questionId || !userId) return null;
  const { data, error } = await supabase
    .from("predictions")
    .select("*")
    .eq("question_id", questionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Tahmini kilitle — bir kere, değiştirilemez (unique(question_id,user_id) + RLS'te update/delete yok).
// Zaten kilitliyse (23505 unique ihlali) sessizce mevcut kaydı döner — kullanıcı hata görmez.
export async function lockPrediction(questionId, userId, direction, confidence) {
  if (!["up", "down"].includes(direction)) return { ok: false, error: "Yön geçersiz." };
  if (!supabase || !questionId || !userId) return { ok: false, error: "Giriş gerekli." };
  const c = Math.min(0.95, Math.max(0.5, Number(confidence) || 0.5));
  const { data, error } = await supabase
    .from("predictions")
    .insert({ question_id: questionId, user_id: userId, direction, confidence: c })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: true, prediction: await fetchMyPrediction(questionId, userId) };
    return { ok: false, error: "Kilitlenemedi — tekrar dene." };
  }
  return { ok: true, prediction: data };
}

// Lig tablosu + kalibrasyon için: tüm kullanıcıların ÇÖZÜLMÜŞ sorulardaki tahminleri.
// RLS zaten yalnız (kendi satırların + çözülmüş sorular) döner; question.resolved filtresi
// burada ikinci bir savunma katmanı (aktif soru satırları asla lig'e karışmasın).
export async function fetchResolvedPredictions() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("predictions")
    .select("user_id, direction, confidence, question:prediction_questions(resolved, outcome)")
    .order("created_at", { ascending: true });
  if (error) return [];
  return toBrierRows(data);
}

// Yalnız GİRİŞLİ kullanıcının kendi geçmişi — kişisel kalibrasyon eğrisi/aşırı özgüven dersi buradan.
export async function fetchMyResolvedPredictions(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("predictions")
    .select("user_id, direction, confidence, question:prediction_questions(resolved, outcome)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return toBrierRows(data);
}
