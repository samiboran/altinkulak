// Tarayici bildirimi + "gorulmus sinyal" kaydi (yalniz sekme acikken — arka plan push YOK).
const SEEN_KEY = "ak_seen_signals_v1";

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); }
  catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch { /* dolu — onemsiz */ }
}

export function isSeen(id) { return loadSeen().has(id); }
export function markSeen(id) {
  const s = loadSeen();
  s.add(id);
  saveSeen(s);
}

export async function requestNotifyPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

export function notify(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch { /* bazi tarayicilar servis worker ister — sessiz gec */ }
}
