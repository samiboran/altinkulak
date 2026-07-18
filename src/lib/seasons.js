// AK-083-TAMAMLAMA/C7: Sezon iskeleti — yalnız isim + tarih aralığı (D17). Ekstra mekanik yok.
// Arşivleme/rozet dağıtımı AYRI bir işlem gerektirmez: predictions/replay_scores zaten
// created_at'li append-only (D9); badges.js zaten saf türetim (bkz. profileStats.js wiring).
import { supabase } from "./supabase.js";
import { brierScore } from "./brier.js";

// ================= saf fonksiyonlar (test edilir) =================

// rows: predictions.js:toBrierRowsWithDate() çıktısı [{confidence, hit, closesAt}, ...]
// season: {starts_at, ends_at}
// badges.js:deriveBadges'in beklediği {avg, weeks} şeklini üretir (weeks ~ katıldığı soru sayısı,
// haftada bir soru olduğu için). Sezon yoksa ya da pencerede hiç tahmin yoksa dürüst null (D6).
export function computeSeasonBrier(rows, season) {
  if (!season) return null;
  const start = new Date(season.starts_at).getTime();
  const end = new Date(season.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const inSeason = (rows || []).filter((r) => {
    const t = new Date(r.closesAt).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  });
  if (!inSeason.length) return null;
  const scored = inSeason.map((r) => brierScore(r.confidence, r.hit));
  const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
  return { avg: Math.round(avg * 10000) / 10000, weeks: inSeason.length };
}

// ================= Supabase I/O =================

export async function fetchActiveSeason() {
  if (!supabase) return null;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}
