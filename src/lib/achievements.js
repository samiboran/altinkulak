// AK-086/C2-C3: Achievement motoru — saf fonksiyonlar.
// Achievement = ilerleme merdiveni: hedef ÖNCEDEN görünür, progress bar dolar,
// tamamlanınca Kulak Puanı (points.js) + varsa rozet (badges.js) açılır.
// Rozetten farkı budur: rozet anıt, achievement yol haritası. Edge rank'a ASLA akmaz (D15).
// Trade-bazlı achievement YOK — süreç davranışı ödüllenir, sonuç davranışı asla.

export const ACHIEVEMENTS = [
  { key: "ilk_adim",    title: "İlk Adım",       desc: "Profilini tamamla",                          points: 20,  stat: "profileComplete",   target: 1 },
  { key: "ogrenci",     title: "Öğrenci",        desc: "İlk dersi bitir",                            points: 30,  stat: "lessonsDone",       target: 1 },
  { key: "gozlemci",    title: "Gözlemci",       desc: "5 gün üst üste giriş yap",                   points: 30,  stat: "loginStreak",       target: 5 },
  { key: "sesini_duyur",title: "Sesini Duyur",   desc: "Faydalı işareti alan ilk yorumun",           points: 50,  stat: "helpfulMarks",      target: 1 },
  { key: "kahin_adayi", title: "Kahin Adayı",    desc: "İlk Tahmin Ligi katılımın",                  points: 30,  stat: "predictions",       target: 1 },
  { key: "paylasimci",  title: "Paylaşımcı",     desc: "İlk doğrulanmış stratejin yayında",          points: 80,  stat: "verifiedStrategies",target: 1, badge: "ilk_dogrulanmis" },
  { key: "davetci",     title: "Davetçi",        desc: "Davet ettiğin ilk üye aktifleşti",           points: 100, stat: "activeInvites",     target: 1 },
  { key: "senaryo",     title: "Senaryo Gezgini",desc: "İlk replay senaryonu tamamla",               points: 30,  stat: "scenariosDone",     target: 1 },
];

// stats: kullanıcının event log'dan türetilmiş sayaçları (D9 — burada da durum log'dan gelir).
// Dönen her kayıt: { ...tanım, current, done, pct } — UI progress barı pct'den çizer.
export function deriveProgress(stats = {}) {
  return ACHIEVEMENTS.map(a => {
    const current = Math.max(0, stats[a.stat] || 0);
    const done = current >= a.target;
    return { ...a, current: Math.min(current, a.target), done, pct: Math.min(100, Math.round((current / a.target) * 100)) };
  });
}

// Yeni tamamlananlar: önceki done seti ile şimdiki durum karşılaştırılır —
// çağıran taraf bunlar için points.js earn() tetikler + kutlama gösterir.
// (Puan verme İŞİ burada değil: tek sorumluluk, çift ödeme riski points.js tavanlarında zaten kilitli.)
export function newlyCompleted(stats, previouslyDoneKeys = []) {
  const prev = new Set(previouslyDoneKeys);
  return deriveProgress(stats).filter(a => a.done && !prev.has(a.key));
}
