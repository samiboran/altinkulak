// AK-085-TAMAMLAMA/C2: Chart.jsx'in birden fazla yerde (masaüstü sağ-tık, mobil uzun-bas)
// tekrarladığı "bu nokta çizilebilir alanın içinde mi" sınır kontrolü — eksen/RSI paneli
// dışarıda tutulur (fiyat/bar eşlemesi orada anlamsız). Saf fonksiyon, Chart.jsx'e bağımsız test edilir.
export function inPlotArea(px, py, bounds) {
  const { pL, pR, pT, pB, W, H } = bounds;
  return px >= pL && px <= W - pR && py >= pT && py <= H - pB;
}

// AK-092: mobil tam ekran tetiği — bir dokunuşun "düz tap" mı (sürükleme/pinch/uzun-bas DEĞİL)
// olduğuna karar veren saf fonksiyon. Chart.jsx parmak kalkışında (touchend) başlangıç/bitiş
// koordinat farkını ve geçen süreyi verir; pan/pinch/uzun-bas mantığına hiç karışmaz (onlar zaten
// kendi ayrı state'leriyle çalışır) — bu yalnız "fullscreen açılsın mı" kararını izole eder.
export function isTapGesture(dx, dy, dtMs, { maxMs = 400, tol = 10 } = {}) {
  return Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(dtMs)
    && dtMs >= 0 && dtMs < maxMs && Math.hypot(dx, dy) <= tol;
}

// AK-092: 860px — chart.css'teki .ak-c-fs-btn / mobil breakpoint media query'siyle AYNI eşik.
// JS tarafında yalnız "tap ile tam ekran açılsın mı" kararı için kullanılır (buton görünürlüğü
// zaten CSS media query ile kontrol edilir, bu SADECE dokunuş yoluna karşılık gelir).
export function isMobileFullscreenWidth(width, breakpoint = 860) {
  return Number.isFinite(width) && width <= breakpoint;
}
