// AK-izleme-toggle: İzleme listesi — "Geçmiş veriyi göster" aç/kapa.
// SORUN: izlemeye eklemek ile backtest/geçmiş veri hesaplanması birbirine bağlıydı — bir
// sembol eklenince runBacktest hemen otomatik çalışıp gösteriliyordu. Bu modül ikisini ayırır:
// Izleme.jsx artık runBacktest/latestFvgSignal'ı YALNIZ kullanıcı bu sembol için toggle'ı
// AÇTIĞINDA çağırır (bkz. getOrComputeHistory). Backtest motorunun kendisi (backtest.js)
// DEĞİŞMEDİ — bu dosya yalnız İzleme katmanında, motorun NE ZAMAN çağrılacağını kontrol eder.
//
// store parametresi (getItem/setItem taşıyan nesne) DI ile enjekte edilir — üretimde
// varsayılan gerçek localStorage'dır, testler kendi izole sahte store'unu verip global
// durumu/diğer testleri etkilemeden taze/bayat senaryolarını doğrular.
import { runBacktest, latestFvgSignal } from "./backtest.js";

const CACHE_KEY = "ak_watch_history_cache_v1";
const FOUR_H_MS = 4 * 60 * 60 * 1000;

function defaultStore() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function loadCacheStore(store) {
  if (!store) return {};
  try { return JSON.parse(store.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCacheStore(store, all) {
  if (!store) return;
  try { store.setItem(CACHE_KEY, JSON.stringify(all)); } catch { /* dolu — önemsiz */ }
}

// Son KAPANMIŞ 4H mumunun sınır zamanı (epoch ms) — Binance'in UTC hizalı 4H mumlarıyla tutarlı.
export function lastClosedFourHourBoundary(now = Date.now()) {
  return Math.floor(now / FOUR_H_MS) * FOUR_H_MS;
}

// D14 pattern: cache, KENDİ hesaplanma anına (computedAt) göre taze/bayat kararı verir —
// sayfa yenilense/sekme değişse de bu değişmez. Taze = computedAt, son kapanmış 4H mumundan
// YENİ (o mum kapanalı bu hesap yeniden yapılmamış — yapmanın bir anlamı yok, aynı barlarla
// aynı sonucu üretirdi).
export function isHistoryCacheFresh(cache, now = Date.now()) {
  if (!cache || !Number.isFinite(cache.computedAt)) return false;
  return cache.computedAt >= lastClosedFourHourBoundary(now);
}

export function getCachedHistory(sym, store = defaultStore()) {
  const all = loadCacheStore(store);
  return all[String(sym).toUpperCase()] || null;
}

// result: computeHistory() çıktısı (saf/JSON-serileştirilebilir). Döner: {computedAt, result}.
export function setCachedHistory(sym, result, now = Date.now(), store = defaultStore()) {
  const all = loadCacheStore(store);
  const entry = { computedAt: now, result };
  all[String(sym).toUpperCase()] = entry;
  saveCacheStore(store, all);
  return entry;
}

// Backtest motorunu ÇALIŞTIRIR (pahalı adım: ATR/EMA/FVG taraması + Monte Carlo + Bonferroni
// kontrol simülasyonu) — yalnız Izleme kartında gösterilecek alt kümeyi (t/edge/hipotez/sig)
// çıkarır. Motorun kendisine (runBacktest/latestFvgSignal) hiçbir değişiklik yapılmadı.
export function computeHistory(bars, opts) {
  const r = runBacktest(bars, opts);
  if (!r) return null;
  const sig = latestFvgSignal(bars, r);
  return { t: r.tStat, edge: r.verdict.good, hipotez: r.tStat < 2, sig };
}

// Cache taze ise ONU döner (motor HİÇ ÇAĞRILMAZ) — bayat/yoksa hesaplar ve cache'i günceller.
// Döner: {computedAt, result} | null (computeHistory null dönerse, ör. yetersiz bar).
export function getOrComputeHistory(sym, bars, opts, now = Date.now(), store = defaultStore()) {
  const cached = getCachedHistory(sym, store);
  if (isHistoryCacheFresh(cached, now)) return cached;
  const result = computeHistory(bars, opts);
  if (!result) return null;
  return setCachedHistory(sym, result, now, store);
}
