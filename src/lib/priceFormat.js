// Fiyat gösterimi — tick size'a göre dinamik hassasiyet.
// Amaç: TÜM sembollere aynı büyüklük-tabanlı yuvarlamayı (toFixed(2) gibi sabit) uygulamak
// yerine, COIN'İN GERÇEK Binance tick size'ına göre ondalık basamak sayısı türetilir.
// Bilinmeyen çift için büyüklük-tabanlı yedek korunur (çökme yok) — ama bilinen coinler artık
// KENDİ piyasa hassasiyetiyle gösterilir (D14/AK-FVG-panel).

// Binance PRICE_FILTER tickSize referansı (fiyat aralığı zamanla değişebilir; borsa
// exchangeInfo'sundan güncellenmesi gerekir — burada TARAYICI kotasız/anahtarsız çalışsın
// diye statik bir başlangıç tablosu tutulur).
const TICK_SIZES = {
  BTCUSDT: 0.01,
  ETHUSDT: 0.01,
  SOLUSDT: 0.01,
  AVAXUSDT: 0.01,
  TRXUSDT: 0.00001,
  DOGEUSDT: 0.00001,
  BNBUSDT: 0.01,
  HYPEUSDT: 0.001,
};

// Bir tick size değerinden (ör. 0.00001) ondalık basamak sayısını çıkarır.
// Kayan nokta gürültüsünü (0.00001 -> 0.0000099999...) toFixed(10) ile temizler.
export function decimalsFromTick(tick) {
  if (!Number.isFinite(tick) || tick <= 0) return null;
  const s = tick.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

// pair: Binance sembol çifti (ör. "TRXUSDT"). Bilinmiyorsa null.
export function tickSizeForPair(pair) {
  return TICK_SIZES[pair?.toUpperCase()] ?? null;
}

// Tick size bilinmeyen çiftler için büyüklük-tabanlı yedek (mevcut Izleme.jsx fmtP ile aynı kural).
function fallbackDecimals(price) {
  const a = Math.abs(price);
  if (a >= 1000) return 0;
  if (a >= 100) return 1;
  if (a >= 1) return 2;
  return 4;
}

// Fiyatı, pair biliniyorsa coin'in gerçek tick size'ına, bilinmiyorsa büyüklüğe göre biçimlendirir.
// Küsürat YUVARLANMAZ ötesine gitmez — yalnızca gösterim basamak sayısı seçilir.
export function formatPriceTick(price, pair) {
  if (price == null || !Number.isFinite(price)) return "—";
  const tick = tickSizeForPair(pair);
  const decimals = tick != null ? decimalsFromTick(tick) : null;
  const d = decimals != null ? decimals : fallbackDecimals(price);
  const abs = Math.abs(price);
  if (d === 0 && abs >= 10000) return Math.round(price).toLocaleString("en-US");
  return price.toFixed(d);
}
