// AK-078: PortfolioPanel.jsx'in görüntüleme biçimlendirme yardımcıları — SAF fonksiyonlar,
// component dosyasından ayrı (plain .js) tutuldu ki Node'da (JSX derleyicisi olmadan) test edilebilsin.

// D13: gerçek zamanlı bir FX beslemesi YOK — bu, yalnız GÖRÜNTÜLEME amaçlı, açıkça yaklaşık bir
// referans kur. Kullanıcının GİRDİĞİ işlemlerdeki gerçek kur ayrıca fx_rate_at_entry olarak
// event'e yazılır (portfolio.js/D8) ve modalda kullanıcı isterse bu değeri override edebilir.
export const APPROX_USD_TRY = 34;

export function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export function toDisplay(usd, currency) {
  return currency === "TRY" ? usd * APPROX_USD_TRY : usd;
}

// D13: gizlilik modu — tutarlar SADECE ••••'e döner, yüzdeler (fmtPct) bu maskeye hiç girmez ve
// her zaman görünür kalır.
export function fmtDisplay(usd, currency, hide) {
  if (hide) return "••••";
  const v = toDisplay(usd, currency);
  const symbol = currency === "TRY" ? "₺" : "$";
  const sign = v < 0 ? "-" : "";
  return sign + symbol + Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
}
