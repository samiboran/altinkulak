// AK-092: mobil grafik tam ekran modundan çıkış kararı. X/ESC/Android donanım geri tuşu hepsi
// AYNI yoldan geçer (Lab.jsx:requestExitFullscreen) — tam ekrana girerken history.pushState ile
// eklenen işaret varsa "geri" tetiklenir (popstate fullscreen'i kapatır, Android geri tuşuyla
// birebir aynı davranış); yoksa doğrudan state kapatılır. Saf karar — window.history'ye Lab.jsx'te bağlanır.
export function exitPlan(historyState) {
  return { goBack: !!(historyState && historyState.akFullscreen) };
}
