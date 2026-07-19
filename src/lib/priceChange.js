// AK-089: bar dizisinden dönemsel yüzde değişim — PortfolioPanel.jsx'in AssetDetailModal'ında
// (AK-079) modül-içi tanımlıydı, Izleme.jsx'in izleme listesi detay ekranı da AYNI hesaba
// ihtiyaç duyduğu için buraya taşındı (iki yerde aynı mantık tekrar yazılmasın). Davranış
// DEĞİŞMEDİ — yalnız konum.
export function periodChangePct(bars, lookbackBars) {
  if (!bars || bars.length < 2) return null;
  const idx = Math.max(0, bars.length - 1 - lookbackBars);
  if (idx >= bars.length - 1) return null; // yeterli geçmiş yok — dürüstçe "yok" de
  const past = bars[idx]?.c, now = bars[bars.length - 1]?.c;
  if (!past) return null;
  return ((now - past) / past) * 100;
}

export const WEEK_BARS = 42; // ~7 gün × 24s / 4s mum

// AK-079/AK-031: zaman aralığı seçici yalnız GERÇEKTEN eldeki bar aralığına (900 bar × 4s ≈ 150
// gün) sığan seçenekler sunar — YTD/1Y/5Y gibi kapsamayanlar dürüstlük ilkesi gereği eklenmez.
export const DETAIL_PERIODS = [
  { key: "1G", label: "1G", bars: 6 },
  { key: "1H", label: "1H", bars: WEEK_BARS },
  { key: "1A", label: "1A", bars: 180 },
  { key: "3A", label: "3A", bars: 540 },
  { key: "TUM", label: "Tümü", bars: Infinity },
];
