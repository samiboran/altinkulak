// AK-083/M3: Rozet motoru — tanımlar + türetme. Saf fonksiyonlar.
// Rozet = kazanılmış davranışın anıtı (koleksiyon). Achievement (AK-086) hedefi önceden
// gösterir, tamamlanınca buradaki rozeti açar. İkisi de edge rank'a ASLA akmaz (D15).
// secret: true → kazanılana dek listede görünmez (sürpriz).

export const BADGES = [
  { key: "ilk_sicil",        title: "İlk Sicil",        desc: "İlk işlem kaydını logladın",                       secret: false },
  { key: "seri_7",           title: "7 Gün Seri",       desc: "7 gün kesintisiz sicil girişi",                    secret: false },
  { key: "seri_30",          title: "30 Gün Seri",      desc: "30 gün kesintisiz sicil girişi",                   secret: false },
  { key: "ilk_dogrulanmis",  title: "Kanıt Sahibi",     desc: "İlk doğrulanmış stratejin (OOS t≥2, n≥30)",        secret: false },
  { key: "kalibrasyon",      title: "Kalibrasyon Ustası", desc: "Sezon ort. Brier < 0.15 (en az 8 hafta katılım)", secret: false },
  { key: "senaryo_gezgini",  title: "Senaryo Gezgini",  desc: "5 replay senaryosu tamamladın",                    secret: false },
  { key: "disiplin",         title: "Disiplin",         desc: "Sert düşüş gününde sicil logladın, işlem açmadın", secret: true },
  { key: "kurucu",           title: "Kurucu Üye",       desc: "İlk 100 üyeden birisin",                           secret: true },
];

export const BADGE_KEYS = BADGES.map(b => b.key);

// Kullanıcı istatistik özetinden hak edilen rozetleri türetir — event log'dan
// hesaplanmış özet beklenir (D9: durum log'dan türetilir, burada da öyle).
// stats: {
//   sicilCount, maxStreakDays, verifiedStrategies,
//   seasonBrier: {avg, weeks},        // Tahmin Ligi sezonu
//   scenariosDone,                     // replay
//   disciplineDays,                    // sert düşüş günü + sicil var + işlem yok (motor sayar)
//   memberIndex                        // kayıt sırası (1 tabanlı)
// }
export function deriveBadges(stats = {}) {
  const out = new Set();
  if ((stats.sicilCount || 0) >= 1) out.add("ilk_sicil");
  if ((stats.maxStreakDays || 0) >= 7) out.add("seri_7");
  if ((stats.maxStreakDays || 0) >= 30) out.add("seri_30");
  if ((stats.verifiedStrategies || 0) >= 1) out.add("ilk_dogrulanmis");
  if (stats.seasonBrier && stats.seasonBrier.weeks >= 8 && stats.seasonBrier.avg < 0.15) out.add("kalibrasyon");
  if ((stats.scenariosDone || 0) >= 5) out.add("senaryo_gezgini");
  if ((stats.disciplineDays || 0) >= 1) out.add("disiplin");
  if (stats.memberIndex != null && stats.memberIndex <= 100) out.add("kurucu");
  return [...out];
}

// Profil vitrini için görünürlük: kazanılmamış gizli rozetler LİSTEDE YOK —
// "kilitli gizemli kutu" gösterilmez, sürpriz sürpriz kalır.
export function visibleBadges(earnedKeys = []) {
  const earned = new Set(earnedKeys);
  return BADGES.filter(b => earned.has(b.key) || !b.secret)
    .map(b => ({ ...b, earned: earned.has(b.key) }));
}
