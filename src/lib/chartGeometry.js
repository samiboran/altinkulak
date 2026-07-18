// AK-085-TAMAMLAMA/C2: Chart.jsx'in birden fazla yerde (masaüstü sağ-tık, mobil uzun-bas)
// tekrarladığı "bu nokta çizilebilir alanın içinde mi" sınır kontrolü — eksen/RSI paneli
// dışarıda tutulur (fiyat/bar eşlemesi orada anlamsız). Saf fonksiyon, Chart.jsx'e bağımsız test edilir.
export function inPlotArea(px, py, bounds) {
  const { pL, pR, pT, pB, W, H } = bounds;
  return px >= pL && px <= W - pR && py >= pT && py <= H - pB;
}
