// AK-101: Portföy geçmişi (günlük/haftalık/aylık + takvim). Portföy henüz Supabase'e taşınmadı
// (AK-099, backlog) — bu yüzden gerçek sunucu-taraflı "gün sonu cron"u YOK. v1 istemci tarafında:
// uygulama açıldığında, bugün için henüz kayıt yoksa o anki toplam değer "bugünün son bilinen
// değeri" olarak kaydedilir (ledger.js'in append-only desenindeki gibi, snapshot'lar ÜZERİNE
// YAZILMAZ — yalnız günde bir kez eklenir). Bu, D14'ün ruhuyla tutarlı: gösterilen değer o günkü
// SON GÜNCELLEME anıdır, "canlı/kesintisiz gün sonu" değildir — dürüstçe böyle kalır.
//
// Saklama: localStorage, ~1 yıl (370 gün tampanlı) — daha eskisi storage'ı şişirmesin diye budanır.

const SSKEY = "ak_portfolio_snapshots_v1";
export const MAX_SNAPSHOT_DAYS = 370;

function loadStore(store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s) return [];
  try {
    const a = JSON.parse(s.getItem(SSKEY));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveStore(list, store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s) return;
  try { s.setItem(SSKEY, JSON.stringify(list)); } catch { /* kotayı aşarsa sessiz geç */ }
}

// Yerel tarih anahtarı (kullanıcının kendi günü — UTC değil, "bugün" kullanıcı için ne ise o).
export function localDateKey(ts) {
  const d = new Date(ts);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// SAF fonksiyon: mevcut liste + bugünün toplam değeri -> güncellenmiş liste (varsa değiştirmez,
// yoksa ekler, MAX_SNAPSHOT_DAYS'i aşarsa en eskisini budar). Depolamadan ayrık, test edilebilir.
export function withTodaySnapshot(snapshots, totalValueUsd, now = Date.now()) {
  if (!Number.isFinite(totalValueUsd)) return snapshots;
  const dateKey = localDateKey(now);
  if (snapshots.some((s) => s.date === dateKey)) return snapshots; // bugün zaten kaydedildi — üzerine yazma
  const next = [...snapshots, { date: dateKey, value: totalValueUsd, ts: now }];
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.length > MAX_SNAPSHOT_DAYS ? next.slice(next.length - MAX_SNAPSHOT_DAYS) : next;
}

export function recordSnapshotIfNeeded(totalValueUsd, now = Date.now(), store) {
  const cur = loadStore(store);
  const next = withTodaySnapshot(cur, totalValueUsd, now);
  if (next !== cur) saveStore(next, store);
  return next;
}

export function getSnapshots(store) {
  return loadStore(store);
}

// İki tarih anahtarı arasındaki takvim günü farkı (yalnız YYYY-MM-DD karşılaştırması, saat dilimi karışmaz).
function daysBetween(dateKeyA, dateKeyB) {
  const a = new Date(dateKeyA + "T00:00:00"), b = new Date(dateKeyB + "T00:00:00");
  return Math.round((a - b) / 86400000);
}

// N gün öncesine EN YAKIN (o günden daha eski olmayan ilk) snapshot'ı bulur — her gün tam
// kayıt olmayabilir (uygulama o gün hiç açılmamış olabilir), en yakın makul referans kullanılır.
function snapshotNDaysBefore(snapshots, latestDateKey, n) {
  if (!snapshots.length) return null;
  const targetKey = localDateKey(new Date(latestDateKey + "T00:00:00").getTime() - n * 86400000);
  let best = null;
  for (const s of snapshots) {
    if (s.date > latestDateKey) continue;
    if (s.date <= targetKey) { if (!best || s.date > best.date) best = s; }
  }
  return best;
}

// Dönemsel toplam getiri — D13 ile tutarlı, dürüstçe: yetersiz geçmişte null (fabrike yüzde yok).
export function periodReturnPct(snapshots, days) {
  if (snapshots.length < 2) return null;
  const latest = snapshots[snapshots.length - 1];
  const ref = snapshotNDaysBefore(snapshots, latest.date, days);
  if (!ref || ref.date === latest.date || !(ref.value > 0)) return null;
  return ((latest.value - ref.value) / ref.value) * 100;
}

export function dailyReturnPct(snapshots) { return periodReturnPct(snapshots, 1); }
export function weeklyReturnPct(snapshots) { return periodReturnPct(snapshots, 7); }
export function monthlyReturnPct(snapshots) { return periodReturnPct(snapshots, 30); }

// Belirli bir ay için takvim hücreleri: her gün {day, date, returnPct} — returnPct yalnız o gün
// VE bir önceki takvim günü için snapshot varsa hesaplanır, yoksa null (boş/nötr hücre — dürüst).
export function calendarMonth(snapshots, year, monthIndex0) {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const cells = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const today = byDate.get(dateKey);
    let returnPct = null;
    if (today) {
      const prevKey = localDateKey(new Date(dateKey + "T00:00:00").getTime() - 86400000);
      const prev = byDate.get(prevKey);
      if (prev && prev.value > 0) returnPct = ((today.value - prev.value) / prev.value) * 100;
    }
    cells.push({ day, date: dateKey, value: today ? today.value : null, returnPct });
  }
  return cells;
}
