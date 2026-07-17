// AK-083/M1: Tahmin Ligi skorlama motoru — saf fonksiyonlar.
// Brier skoru: (güven - sonuç)². DÜŞÜK iyi. 0 = mükemmel, 0.25 = yazı-tura, 1 = tam ters.
// Lig sıralaması ortalama Brier'e göre ASC. Kalibrasyon eğrisi eğitim ekranını besler:
// "%80 diyenlerin gerçekte yüzde kaçı tuttu?" — aşırı özgüven terbiyesi.

// Tek tahmin skoru. confidence: [0.5, 0.95] arası olasılık (yön zaten seçilmiş),
// hit: tahmin tuttu mu (bool). Örn. %80 güven + tutmadı → (0.8-0)² = 0.64.
export function brierScore(confidence, hit) {
  const c = clamp(confidence);
  const o = hit ? 1 : 0;
  return +((c - o) ** 2).toFixed(4);
}

function clamp(c) {
  if (typeof c !== "number" || Number.isNaN(c)) return 0.5;
  return Math.min(0.95, Math.max(0.5, c));
}

// Kullanıcının dönem ortalaması. preds: [{confidence, hit}]. Boşsa null (sıralamaya girmez).
export function meanBrier(preds) {
  const valid = (preds || []).filter(p => typeof p.hit === "boolean");
  if (!valid.length) return null;
  const s = valid.reduce((a, p) => a + brierScore(p.confidence, p.hit), 0);
  return +(s / valid.length).toFixed(4);
}

// Lig tablosu: [{userId, preds}] → ortalama Brier ASC sıralı, min katılım eşiği altındakiler
// "sıralama dışı" işaretlenir (tek şanslı tahminle lig kazanılmasın — n küçükken varyans aldatır).
export function leaderboard(entries, minPreds = 4) {
  return (entries || [])
    .map(e => {
      const valid = (e.preds || []).filter(p => typeof p.hit === "boolean");
      return { userId: e.userId, n: valid.length, avg: meanBrier(valid), ranked: valid.length >= minPreds };
    })
    .filter(e => e.avg != null)
    .sort((a, b) => {
      if (a.ranked !== b.ranked) return a.ranked ? -1 : 1; // sıralamaya girenler önce
      return a.avg - b.avg;
    });
}

// Kalibrasyon eğrisi: güven kovalarına göre gerçekleşme oranı.
// Dönen her kova: { lo, hi, n, hitRate, avgConf } — UI "%80 diyenlerin %55'i tuttu" der.
export function calibrationCurve(preds, buckets = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 0.951]]) {
  const valid = (preds || []).filter(p => typeof p.hit === "boolean");
  return buckets.map(([lo, hi]) => {
    const inB = valid.filter(p => { const c = clamp(p.confidence); return c >= lo && c < hi; });
    const hits = inB.filter(p => p.hit).length;
    return {
      lo, hi: Math.min(hi, 0.95), n: inB.length,
      hitRate: inB.length ? +(hits / inB.length).toFixed(3) : null,
      avgConf: inB.length ? +(inB.reduce((a, p) => a + clamp(p.confidence), 0) / inB.length).toFixed(3) : null,
    };
  });
}

// Aşırı özgüven ölçüsü: ort. güven - ort. isabet. Pozitif = kendine fazla güveniyor.
// Eğitim ekranının tek cümlelik dersi buradan çıkar.
export function overconfidence(preds) {
  const valid = (preds || []).filter(p => typeof p.hit === "boolean");
  if (valid.length < 4) return null; // az veride ders verme — dürüstlük
  const avgC = valid.reduce((a, p) => a + clamp(p.confidence), 0) / valid.length;
  const hitR = valid.filter(p => p.hit).length / valid.length;
  return +(avgC - hitR).toFixed(3);
}
