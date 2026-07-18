// AK-083-TAMAMLAMA/C5-C6: Replay Ligi — veri katmanı + skorlama. Skorlar sicile YAZILMAZ,
// edge rank'a ASLA akmaz (D16). Bir senaryo tekrar oynanabilir ama İLK deneme resmi skordur.
import { supabase } from "./supabase.js";
import { simulateOutcome } from "./backtest.js";

// ================= saf fonksiyonlar (test edilir) =================

// ATR(14) yaklaşık — Lab.jsx'teki pratik replay tahmin modeliyle AYNI yöntem (h-l ortalaması),
// platformun geri kalanıyla aynı zihinsel modeli kullanmak için (tutarlılık).
function atrAt(bars, i, period = 14) {
  let sum = 0, c = 0;
  for (let j = Math.max(1, i - period + 1); j <= i; j++) { sum += bars[j].h - bars[j].l; c++; }
  return c ? sum / c : 0;
}

// entryIdx'te girilirse stop/hedef ne olur — Chart.jsx'in trades prop'unu beslemek ve
// Senaryo.jsx'in playback'i ne zaman durduracağını bilmesi (exitIdx) için dışa açık.
export function entryPlan(bars, entryIdx, dir) {
  if (!bars?.length || entryIdx == null || entryIdx < 1 || entryIdx >= bars.length - 1) return null;
  if (dir !== 1 && dir !== -1) return null;
  const atr = atrAt(bars, entryIdx);
  if (!atr) return null;
  const entry = bars[entryIdx].c;
  const stop = dir === 1 ? entry - atr : entry + atr;
  const target = dir === 1 ? entry + 2 * atr : entry - 2 * atr;
  return { entry, stop, target };
}

// Bir senaryoda giriş kararını (entryIdx, dir) R skoruna + çıkış barına çevirir — ATR stop,
// sabit 1:2 hedef (simulateOutcome zaten test edilmiş/kullanılan backtest.js motoru, burada
// yeniden yazılmaz). Skor -1 (stop), rr (hedef, burada 2) ya da hedef/stop hiç tetiklenmezse
// senaryo sonu kapanışına göre KISMİ R (ne kazandı ne kaybetti gibi görünmesin — dürüst kısmi sonuç).
export function resolveAttemptDetailed(bars, entryIdx, dir) {
  const plan = entryPlan(bars, entryIdx, dir);
  if (!plan) return null;
  const { entry, stop, target } = plan;
  const { outcome, exitIdx } = simulateOutcome(bars, entryIdx, dir, entry, stop, target, bars.length - entryIdx);
  if (outcome != null) return { rScore: outcome, exitIdx };
  const last = bars[bars.length - 1].c;
  const risk = Math.abs(entry - stop);
  const rScore = risk ? Math.round(((last - entry) / risk) * dir * 100) / 100 : 0;
  return { rScore, exitIdx: bars.length - 1 };
}

export function resolveAttempt(bars, entryIdx, dir) {
  return resolveAttemptDetailed(bars, entryIdx, dir)?.rScore ?? null;
}

// Kendi skorunun dağılımdaki yeri (yüzdelik). Az kayıt varsa (minN) dürüst null döner —
// sahte percentile üretilmez (D6); UI bu durumda "ilk denemelerden birisin" gibi bir mesaj gösterir.
export function percentileOf(scores, value, minN = 5) {
  if (!scores || scores.length < minN || value == null) return null;
  const below = scores.filter((s) => s < value).length;
  return Math.round((below / scores.length) * 100);
}

// ================= Supabase I/O =================

export async function fetchScenarioScores(scenarioId) {
  if (!supabase || !scenarioId) return [];
  const { data, error } = await supabase.from("replay_scores").select("r_score").eq("scenario_id", scenarioId);
  if (error) return [];
  return (data || []).map((r) => Number(r.r_score));
}

export async function fetchMyScenarioScore(scenarioId, userId) {
  if (!supabase || !scenarioId || !userId) return null;
  const { data, error } = await supabase
    .from("replay_scores")
    .select("*")
    .eq("scenario_id", scenarioId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// İlk deneme resmi skordur — zaten kayıtlıysa (23505 unique ihlali) sessizce mevcut skoru döner,
// kullanıcı hata görmez (lockPrediction/predictions.js ile aynı desen).
export async function submitScenarioScore(scenarioId, userId, rScore) {
  if (!supabase || !scenarioId || !userId) return { ok: false, error: "Giriş gerekli." };
  if (!Number.isFinite(rScore)) return { ok: false, error: "Geçersiz skor." };
  const { data, error } = await supabase
    .from("replay_scores")
    .insert({ scenario_id: scenarioId, user_id: userId, r_score: rScore })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyScored: true, score: await fetchMyScenarioScore(scenarioId, userId) };
    }
    return { ok: false, error: "Kaydedilemedi — tekrar dene." };
  }
  return { ok: true, alreadyScored: false, score: data };
}

// profileStats.js:scenariosDone için — kaç senaryoyu tamamladı (kaç kullanıcı skoruna bağımsız).
export async function fetchMyScenarioCount(userId) {
  if (!supabase || !userId) return 0;
  const { count } = await supabase.from("replay_scores").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count || 0;
}
