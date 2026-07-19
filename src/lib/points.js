// AK-023-EXT: Kulak Puanı ekonomisi.
// İLKE (D15): kapalı devre — puan alınıp satılamaz, transfer edilemez, TL/USD karşılığı yoktur.
// Kazanım yalnız topluluk yararına davranıştan gelir (işlem hacminden ASLA). Harcama = geçici
// enerji, rütbe = kalıcı itibar; puan harcamak contrib rank'ı DÜŞÜRMEZ (lifetime_points hiç
// azalmaz — bkz. deriveLifetime). ranks.js motoruna dokunulmaz, yalnız contribRank(lifetime) beslenir.
//
// TASARIM: event sourcing (portfolio.js/ledger.js ailesiyle aynı ilke) — tek gerçek kaynak
// point_events log'udur, bakiye/lifetime HER ZAMAN bu log'dan türetilir, ayrı tablo tutulmaz.
//
// DEPOLAMA: usStockPrices.js gibi Supabase-first, kendi kendine yeten domain modülü — portfolio.js/
// ledger.js'in aksine localStorage'a düşmez, çünkü contrib rank BAŞKA kullanıcıların gördüğü public
// bir alan (Profil.jsx vitrin) — cihaz-içi veri bunu besleyemez. Supabase yapılandırılmamışsa
// (ya da satır yoksa) sessizce boş/0 döner — asla fabrike veri (D6).
import { supabase } from "./supabase.js";

export const MONTHLY_CAP = 1500; // kullanıcı başına aylık toplam kazanım tavanı — grind ekonomisi olmasın

// wired:true = bu oturumda gerçekten tetiklenir (streak — ledger.js'ten hesaplanabilir, başka bir
// sisteme bağımlı değil). wired:false = kural tanımlı/şeffaf ama ön koşul sistemi (davet zinciri,
// strateji yayın akışı) henüz yok — "Yakında" olarak dürüstçe işaretlenir, asla sahte kazandırılmaz.
export const EARNING_TABLE = [
  { key: "invite_activated", label: "Davet ettiğin üye aktifleşti (7 gün içinde sicil girişi VEYA doğrulanmış strateji)", points: 100, cap: "ayda 5 davet", wired: false },
  { key: "strategy_verified", label: "Doğrulanmış strateji yayınladın (OOS t≥2, n≥30)", points: 250, cap: "strateji başına 1 kez", wired: false },
  { key: "streak_7", label: "Günlük sicil serisi: 7 gün kesintisiz giriş", points: 50, cap: "haftada 1", wired: true },
  { key: "streak_30", label: "Sicil serisi: 30 gün", points: 300, cap: "ayda 1", wired: true },
  { key: "edu_content", label: "Eğitim içeriği katkısı (onaylanmış)", points: 150, cap: "moderasyon onayı şart, v2", wired: false },
  // AK-090/D18: fikrin "faydalı" işareti aldı — puan İŞARETLEYENE değil, FİKİR SAHİBİNE gider
  // (davranışın hedefi ödüllenir, mevcut earning_table deseniyle tutarlı: paylaşım kalitesi teşvik edilir).
  // Haftalık tavanlı (FAYDALI_WEEKLY_CAP) — yorum/faydalı-işaret çiftçiliği freni.
  { key: "faydali", label: "Fikrin 'faydalı' işareti aldı", points: 10, cap: "haftada 200 puan (çiftçilik freni)", wired: true },
];

// durationDays: null = kalıcı. maxPurchases: null = sınırsız (süreli kalemlerde "aktifken tekrar
// alınamaz" zaten süre kontrolüyle sağlanır).
export const SPENDING_TABLE = [
  { key: "backtest_quota", label: "Gelişmiş backtest kotası (+50 koşu, 30 gün)", cost: 200, durationDays: 30, maxPurchases: null },
  { key: "sandbox_slot", label: "Ekstra sandbox slotu (kalıcı, max 3)", cost: 500, durationDays: null, maxPurchases: 3 },
  { key: "pro_chart", label: "Pro grafik paketi: karşılaştırma modu + çoklu layout (30 gün)", cost: 300, durationDays: 30, maxPurchases: null },
  { key: "badge_showcase", label: "Profil rozeti vitrini (kozmetik, kalıcı)", cost: 150, durationDays: null, maxPurchases: 1 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ================= saf fonksiyonlar (test edilir — Supabase'e bağımlı değil) =================

// Bakiye: TÜM event'lerin (kazanım + harcama) toplamı — harcanan düşer.
export function deriveBalance(events) {
  return (events || []).reduce((a, e) => a + (Number(e.amount) || 0), 0);
}

// Lifetime: yalnız POZİTİF (kazanım) event'lerin toplamı — harcama ASLA düşürmez (D15 kilit karar).
// contribRank (ranks.js) BUNDAN beslenir.
export function deriveLifetime(events) {
  return (events || []).reduce((a, e) => a + Math.max(0, Number(e.amount) || 0), 0);
}

// Belirli bir ay içinde kazanılan (yalnız pozitif) toplam — aylık tavan kontrolü için.
export function monthlyEarned(events, refDate = new Date()) {
  const y = refDate.getFullYear(), m = refDate.getMonth();
  return (events || []).reduce((a, e) => {
    const amt = Number(e.amount) || 0;
    if (amt <= 0) return a;
    const d = new Date(e.ts);
    return d.getFullYear() === y && d.getMonth() === m ? a + amt : a;
  }, 0);
}

export function remainingMonthlyCap(events, refDate = new Date()) {
  return Math.max(0, MONTHLY_CAP - monthlyEarned(events, refDate));
}

// AK-090/D18: "faydalı" işaretinin haftalık tavanı — monthlyEarned'ın haftalık/tip-bazlı
// kardeşi, aynı desen. Yorum/faydalı-işaret çiftçiliğine karşı asıl fren burada (MONTHLY_CAP
// zaten genel bir üst sınır, bu AYRICA tek bir kazanım TİPİNİ haftalık kısıtlar).
export const FAYDALI_WEEKLY_CAP = 200;

export function weeklyEarnedByType(events, type, refDate = new Date()) {
  const cutoff = refDate.getTime() - 7 * DAY_MS;
  return (events || []).reduce((a, e) => {
    const amt = Number(e.amount) || 0;
    if (amt <= 0 || e.type !== type) return a;
    return e.ts >= cutoff ? a + amt : a;
  }, 0);
}

export function remainingFaydaliWeeklyCap(events, refDate = new Date()) {
  return Math.max(0, FAYDALI_WEEKLY_CAP - weeklyEarnedByType(events, "faydali", refDate));
}

// Sicil (ledger.js trades) barından en son güne kadar uzanan kesintisiz gün serisi.
// "İşlem sayısından bağımsız" (enflasyon freni) — bir günde 1 ya da 50 kayıt fark etmez,
// yalnız O GÜN sicile en az bir kayıt girilmiş mi diye bakılır.
export function currentStreakDays(trades) {
  if (!trades || !trades.length) return 0;
  const days = [...new Set(trades.map((t) => new Date(t.d).toISOString().slice(0, 10)))].sort();
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / DAY_MS);
    if (diff === 1) streak++; else break;
  }
  return streak;
}

// Bir streak türü (streak_7/streak_30) son PENCERE içinde zaten ödüllendirildi mi? (haftada/ayda 1 tavanı)
export function streakAwardedRecently(events, type, windowDays, refDate = new Date()) {
  const cutoff = refDate.getTime() - windowDays * DAY_MS;
  return (events || []).some((e) => e.type === type && e.ts >= cutoff);
}

// Harcama kaleminin güncel durumu — event log'dan türetilir, ayrı "aktif kalemler" tablosu YOK.
export function spendItemStatus(events, item, refDate = new Date()) {
  const purchases = (events || []).filter((e) => e.type === "spend" && e.ref_id === item.key).sort((a, b) => a.ts - b.ts);
  const count = purchases.length;
  if (item.durationDays == null) {
    const maxed = item.maxPurchases != null && count >= item.maxPurchases;
    return { active: count > 0, count, maxed, expiresAt: null };
  }
  const last = purchases[purchases.length - 1];
  if (!last) return { active: false, count, maxed: false, expiresAt: null };
  const expiresAt = last.ts + item.durationDays * DAY_MS;
  return { active: refDate.getTime() < expiresAt, count, maxed: false, expiresAt };
}

// Satın alma öncesi kontrol — bakiye yetersizse, zaten aktifse ya da azami sayıya ulaşıldıysa reddeder.
export function canPurchase(events, item, balance, refDate = new Date()) {
  const status = spendItemStatus(events, item, refDate);
  if (status.maxed) return { ok: false, reason: "Azami sayıya ulaşıldı." };
  if (item.durationDays != null && status.active) return { ok: false, reason: "Zaten aktif — süresi dolunca tekrar açabilirsin." };
  if (item.durationDays == null && item.maxPurchases === 1 && status.active) return { ok: false, reason: "Zaten sahipsin." };
  if (balance < item.cost) return { ok: false, reason: "Yetersiz puan." };
  return { ok: true };
}

// ================= Supabase I/O (yapılandırılmamışsa sessizce boş/başarısız döner — D6) =================

export async function listPointEvents(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("point_events").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) return [];
  return (data || []).map((e) => ({ ...e, ts: new Date(e.created_at).getTime() }));
}

// Herkese açık okunur (RLS) — Profil.jsx başka kullanıcının vitrin sayfasında da contrib rank göstersin diye.
export async function fetchLifetimePoints(userId) {
  return deriveLifetime(await listPointEvents(userId));
}

// Kazanım — aylık tavanı geçmeyecek şekilde KLİPLENİR (tamamı reddetmek yerine kalanı verir).
// events önceden çekildiyse tekrar sorgulamamak için geçirilebilir (ör. checkAndAwardStreaks içinden).
export async function awardPoints(userId, type, amount, refId = null, events = null) {
  if (!supabase || !userId || !(amount > 0)) return null;
  const log = events || (await listPointEvents(userId));
  const grant = Math.min(amount, remainingMonthlyCap(log));
  if (grant <= 0) return null; // aylık tavana ulaşıldı — sessizce atla, kullanıcı hata görmez
  const { data, error } = await supabase.from("point_events").insert({ user_id: userId, type, amount: grant, ref_id: refId }).select().maybeSingle();
  if (error) return null;
  return data;
}

// Sicil serisinden (7/30 gün) otomatik ödül — Ben.jsx sayfa yüklendiğinde bir kez çağırır.
// İdempotent: aynı pencere içinde zaten ödüllendiyse tekrar vermez.
export async function checkAndAwardStreaks(userId, trades) {
  if (!supabase || !userId) return;
  const streak = currentStreakDays(trades);
  if (streak < 7) return;
  const events = await listPointEvents(userId);
  if (streak >= 30 && !streakAwardedRecently(events, "streak_30", 30)) {
    await awardPoints(userId, "streak_30", 300, null, events);
  }
  if (!streakAwardedRecently(events, "streak_7", 7)) {
    await awardPoints(userId, "streak_7", 50, null, events);
  }
}

// Harcama — bakiye/aktiflik kontrolünü kendi yapar, negatif event ekler.
export async function spendPoints(userId, item) {
  if (!supabase || !userId) return { ok: false, reason: "Giriş gerekli." };
  const events = await listPointEvents(userId);
  const balance = deriveBalance(events);
  const check = canPurchase(events, item, balance);
  if (!check.ok) return check;
  const { error } = await supabase.from("point_events").insert({ user_id: userId, type: "spend", amount: -item.cost, ref_id: item.key });
  if (error) return { ok: false, reason: "Kayıt başarısız — tekrar dene." };
  return { ok: true };
}
