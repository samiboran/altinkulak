// AK-090: Topluluk Fikirleri — veri katmanı. Sinyal servisi DEĞİL: thesis serbest metin,
// parametre/kod bloğu değil (D3'ün doğal uzantısı — kontrol composer'da, submit öncesi).
// D9 event sourcing: ideas/idea_reactions/idea_reports hepsi append-only, ayrı "durum" tablosu yok.
import { supabase } from "./supabase.js";
import { validateThesis, containsBannedWord } from "./moderation.js";
import { listPointEvents, awardPoints, remainingFaydaliWeeklyCap, EARNING_TABLE } from "./points.js";

export const KATILMIYORUM_DAILY_LIMIT = 5;
const FAYDALI_POINTS = EARNING_TABLE.find((e) => e.key === "faydali")?.points || 0;

// ================= saf fonksiyon (test edilir) =================

// idea_reactions ham satırlarından kart başına {faydali, katilmiyorum} sayaçlarını çıkarır.
export function tallyReactions(rows, ideaIds) {
  const out = {};
  for (const id of ideaIds || []) out[id] = { faydali: 0, katilmiyorum: 0 };
  for (const r of rows || []) {
    if (!out[r.idea_id]) out[r.idea_id] = { faydali: 0, katilmiyorum: 0 };
    if (r.type === "faydali" || r.type === "katilmiyorum") out[r.idea_id][r.type]++;
  }
  return out;
}

// ================= Supabase I/O (yapılandırılmamışsa/boşsa dürüst boş — D6) =================

export async function fetchIdeas(limit = 30) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("ideas").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data || [];
}

export async function fetchIdeasByUser(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("ideas").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

// profileStats.js:ideasCount (C8) için — gerçek paylaşım sayısı.
export async function fetchIdeasCount(userId) {
  if (!supabase || !userId) return 0;
  const { count } = await supabase.from("ideas").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count || 0;
}

// Bir sayfa idea için toplu reaksiyon sayıları — N+1 yerine tek sorgu (fetchProfilesByIds deseniyle aynı ilke).
export async function fetchReactionCounts(ideaIds) {
  if (!supabase || !ideaIds?.length) return {};
  const { data, error } = await supabase.from("idea_reactions").select("idea_id, type").in("idea_id", ideaIds);
  if (error) return tallyReactions([], ideaIds);
  return tallyReactions(data, ideaIds);
}

// Girişli kullanıcının bu sayfadaki ideas'a ZATEN bıraktığı tepkiler — {ideaId: "faydali"|"katilmiyorum"}.
export async function fetchMyReactions(ideaIds, userId) {
  if (!supabase || !ideaIds?.length || !userId) return {};
  const { data, error } = await supabase.from("idea_reactions").select("idea_id, type").eq("user_id", userId).in("idea_id", ideaIds);
  if (error) return {};
  return Object.fromEntries((data || []).map((r) => [r.idea_id, r.type]));
}

export async function fetchTodayKatilmiyorumCount(userId) {
  if (!supabase || !userId) return 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("idea_reactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "katilmiyorum")
    .gte("created_at", startOfDay.toISOString());
  return count || 0;
}

// C1: thesis zorunlu + min uzunluk, küfür/topluluk dili engelleyici (moderation.js). Emir/sinyal
// dili BURADA kontrol edilmez — o yalnız UI'da yumuşak bir uyarı (composer submit ETMEZ engellemez).
export async function createIdea(userId, { symbol, thesis, chartSnapshotRef = null } = {}) {
  const sym = (symbol || "").trim().toUpperCase();
  if (!sym) return { ok: false, error: "Sembol gerekli." };
  const check = validateThesis(thesis);
  if (!check.ok) return { ok: false, error: check.reason };
  if (containsBannedWord(thesis) || containsBannedWord(sym)) {
    return { ok: false, error: "Bu içerik topluluk kurallarına uymuyor." };
  }
  if (!supabase || !userId) return { ok: false, error: "Giriş gerekli." };
  const { data, error } = await supabase
    .from("ideas")
    .insert({ user_id: userId, symbol: sym, thesis: thesis.trim(), chart_snapshot_ref: chartSnapshotRef })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: "Paylaşılamadı — tekrar dene." };
  return { ok: true, idea: data };
}

// C4/C5: Faydalı → idea sahibine puan (haftalık tavanlı), Katılmıyorum → yalnız sayaç (günlük
// kotalı, puan/rozet YOK). Kullanıcı başına idea başına TEK reaksiyon (unique constraint, 23505).
export async function reactToIdea(ideaId, ideaOwnerId, reactorUserId, type) {
  if (!["faydali", "katilmiyorum"].includes(type)) return { ok: false, error: "Geçersiz tepki." };
  if (reactorUserId && reactorUserId === ideaOwnerId) return { ok: false, error: "Kendi fikrine tepki veremezsin." };
  if (!supabase || !ideaId || !reactorUserId) return { ok: false, error: "Giriş gerekli." };

  if (type === "katilmiyorum") {
    const todayCount = await fetchTodayKatilmiyorumCount(reactorUserId);
    if (todayCount >= KATILMIYORUM_DAILY_LIMIT) {
      return { ok: false, quotaExceeded: true, error: "Bugünkü katılmıyorum hakkın bitti." };
    }
  }

  const { data, error } = await supabase
    .from("idea_reactions")
    .insert({ idea_id: ideaId, user_id: reactorUserId, type })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, alreadyReacted: true, error: "Bu fikre zaten bir tepki bıraktın." };
    return { ok: false, error: "Kaydedilemedi — tekrar dene." };
  }

  if (type === "faydali" && ideaOwnerId) {
    const events = await listPointEvents(ideaOwnerId);
    const grant = Math.min(FAYDALI_POINTS, remainingFaydaliWeeklyCap(events));
    if (grant > 0) await awardPoints(ideaOwnerId, "faydali", grant, ideaId, events);
  }
  return { ok: true, reaction: data };
}

// C6: "Bildir" — katılmıyorum'dan bağımsız, otomatik hiçbir aksiyon almaz (manuel review, D20 ailesi).
export async function reportIdea(ideaId, userId, reason, note = "") {
  if (!supabase || !ideaId || !userId) return { ok: false, error: "Giriş gerekli." };
  if (!reason) return { ok: false, error: "Bir sebep seç." };
  const { error } = await supabase.from("idea_reports").insert({ idea_id: ideaId, user_id: userId, reason, note: note || null });
  if (error) return { ok: false, error: "Gönderilemedi — tekrar dene." };
  return { ok: true };
}
