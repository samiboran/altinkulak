// AK-103: telefon kilit ekranı tarzı sola-kaydır-sil jesti — SAF matematik burada (test edilir),
// dokunma olayı bağlama (component) ayrı. Kural: kaydırma yalnız SOLA (negatif) izinli, sağa asla
// taşmaz; bırakınca ya tam açık (Sil butonu görünür) ya tam kapalı durumuna "snap" eder — ara bir
// yerde asılı kalmaz. Silme, açık durumdayken butona AYRICA dokunulunca olur — kaydırmanın kendisi
// hiçbir zaman silmez (yanlışlıkla silmeye karşı D6/D9 ruhuyla tutarlı bir "geri dönüşü kolay" tasarım).

export const SWIPE_REVEAL_PX = 76; // "Sil" butonunun genişliği — açık durumdaki kayma miktarı

// Ham parmak hareketini (dx = current.x - start.x) izinli aralığa kısıtlar.
export function clampSwipeX(dx, maxReveal = SWIPE_REVEAL_PX) {
  if (!Number.isFinite(dx)) return 0;
  return Math.max(-maxReveal, Math.min(0, dx));
}

// Parmak kalkınca: yeterince kaydırılmışsa (yarısından fazla) tam aç, değilse tam kapat.
export function shouldSnapOpen(clampedDx, maxReveal = SWIPE_REVEAL_PX, threshold = 0.5) {
  return Math.abs(clampedDx) >= maxReveal * threshold;
}
