// AK-085-TAMAMLAMA/C4: bir fonksiyonu "bir animasyon karesinde en fazla bir kez çalışır" hale
// getirir — ardı ardına gelen çağrılar SONUNCUSUNUN argümanlarıyla tek çağrıya birleşir. Chart.jsx
// bunu hem crosshair hover'ı (mousemove ham hızında ateşlenir) hem pan/zoom (wheel/touchmove/drag)
// için kullanır — mantık ikisinde de aynı, tekrar yazılmaz. schedule/cancel enjekte edilebilir
// (varsayılan requestAnimationFrame/cancelAnimationFrame) — Node test ortamında (rAF yok) sahte
// bir zamanlayıcıyla test edilir.
export function rafThrottle(fn, schedule = (cb) => requestAnimationFrame(cb), cancel = (id) => cancelAnimationFrame(id)) {
  let pending = null;
  let lastArgs = null;
  function throttled(...args) {
    lastArgs = args;
    if (pending != null) return;
    pending = schedule(() => {
      pending = null;
      fn(...lastArgs);
    });
  }
  throttled.cancel = () => {
    if (pending != null) cancel(pending);
    pending = null;
  };
  return throttled;
}
