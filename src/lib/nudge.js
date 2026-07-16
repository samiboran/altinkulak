// AK-080 C3: "Cihazlar arası senkron için giriş yap" bandı — kapatılınca 7 gün susar, ikinci
// kapatmadan sonra kalıcı susar. SAF fonksiyonlar (state + now enjekte edilir) — Node'da test edilebilir.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NUDGE_KEY = "ak_nudge_sync_v1";

export function shouldShowNudge(state, now = Date.now()) {
  if (!state) return true; // hiç kapatılmadı
  if (state.permanent) return false;
  return now - (state.ts || 0) >= SEVEN_DAYS_MS;
}

export function nextNudgeState(state, now = Date.now()) {
  const count = (state?.count || 0) + 1;
  return { ts: now, count, permanent: count >= 2 };
}

export function loadNudgeState() {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = JSON.parse(localStorage.getItem(NUDGE_KEY));
    return v && typeof v === "object" ? v : null;
  } catch { return null; }
}

export function saveNudgeState(state) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(NUDGE_KEY, JSON.stringify(state)); } catch { /* kotayı aşarsa sessiz geç */ }
}
