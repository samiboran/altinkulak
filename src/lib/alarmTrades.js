// AK-076: sinyal geldiğinde arka planda açılan "hayali işlem" (alarm işlemi) — sonradan fiyat
// stop'a ya da hedef1'e ulaşınca ikinci bir bildirimle "kazandı/kaybetti" haber verir.
// Sandbox.js'e DOKUNULMAZ — orası bilinçli olarak istatistiğe dahil edilmeyen serbest pratik alanı
// (kendi yorumunda açıkça yazıyor); bu, kendi küçük, ayrı modülü. Kazandı/kaybetti hesabı
// backtest.js'teki PAYLAŞILAN simulateOutcome ile yapılır (AK-073'te zaten paylaşılan hale getirildi) —
// mantık burada tekrar edilmez.
import { simulateOutcome } from "./backtest.js";

const LSKEY = "ak_alarm_trades_v1";
const MAX_RECORDS = 200; // localStorage şişmesin — açık kayıtlar hep kalır, en eski kapanmışlar önce budanır

function loadAll() {
  try {
    const a = JSON.parse(localStorage.getItem(LSKEY));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveAll(list) {
  try { localStorage.setItem(LSKEY, JSON.stringify(list)); } catch { /* kotayı aşarsa sessiz geç */ }
}
function trim(list) {
  if (list.length <= MAX_RECORDS) return list;
  const open = list.filter((t) => t.status === "open");
  const closed = list.filter((t) => t.status !== "open").sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  return [...open, ...closed].slice(0, MAX_RECORDS);
}

// Sinyal ilk kez görüldüğünde çağrılır (Izleme.jsx'in isSeen/markSeen kapısıyla aynı anda tetiklenir).
// Aynı sinyal id'si için ikinci kez çağrılırsa yok sayılır — tekrar açmaz.
export function addAlarmTrade(signal) {
  const all = loadAll();
  if (all.some((t) => t.id === signal.id)) return null;
  const rec = {
    id: signal.id, sym: signal.sym, dir: signal.dir,
    entry: signal.entry, stop: signal.stop, hedef1: signal.hedef1, hedef2: signal.hedef2,
    entryIdx: signal.barIndex, openedAt: signal.time ?? Date.now(),
    status: "open", closedAt: null,
  };
  saveAll(trim([...all, rec]));
  return rec;
}

// AK-102: hedef1 (won kapanış) sonrası — kapanış anında elde ne kadar bar varsa o kadarında
// hedef2'ye de dokunulmuş mu, saf tarama. YALNIZ kapanış anında bir kez bakılır (trade "open"
// olmaktan çıktığı için tekrar taranmaz) — dürüst sınır: hedef2 kapanıştan SONRA vurulursa
// bu kayıtta görünmez (geriye dönük "aslında sonra ulaştı" bilgisi tutulmaz, D6 fabrike veri
// yasağıyla tutarlı — ancak GERÇEKTEN gördüğümüz veriyi bildiririz).
function hedef2ReachedByThen(bars, dir, fromIdx, hedef2) {
  if (hedef2 == null) return false;
  for (let j = fromIdx + 1; j < bars.length; j++) {
    const hit = dir === 1 ? bars[j].h >= hedef2 : bars[j].l <= hedef2;
    if (hit) return true;
  }
  return false;
}

// sym'e ait AÇIK kayıtları güncel bars ile kontrol eder; stop/hedef1'den hangisi önce vurulduysa
// status'u "won"/"lost" yapıp kaydeder. Yeni kapananları döner (çağıran bildirim göndersin diye).
export function checkOpenAlarmTrades(sym, bars) {
  if (!bars || !bars.length) return [];
  const all = loadAll();
  const closedNow = [];
  let changed = false;
  for (const t of all) {
    if (t.sym !== sym || t.status !== "open") continue;
    if (t.entryIdx == null || t.entryIdx < 0) continue;
    // canlıda sabit 40 bar penceresiyle sınırlı değiliz — elde ne kadar bar varsa o kadar taranır
    const lookahead = Math.max(1, bars.length - t.entryIdx);
    const { outcome, exitIdx } = simulateOutcome(bars, t.entryIdx, t.dir, t.entry, t.stop, t.hedef1, lookahead);
    if (outcome == null) continue;
    t.status = outcome > 0 ? "won" : "lost";
    t.closedAt = bars[exitIdx]?.time ?? Date.now();
    if (t.status === "won") t.hitHedef2 = hedef2ReachedByThen(bars, t.dir, exitIdx, t.hedef2);
    changed = true;
    closedNow.push(t);
  }
  if (changed) saveAll(trim(all));
  return closedNow;
}

// Alarm Geçmişi listesi için — en yeni açılan en üstte.
export function listAlarmTrades() {
  return loadAll().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
}
