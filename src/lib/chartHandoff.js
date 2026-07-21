// AK-102: Alarm Geçmişi kartındaki "grafikte gör" — o sinyalin giriş/TP1/TP2/SL seviyelerini
// Lab.jsx'in grafiğinde işaretler. Chart.jsx'in KENDİ çizim state'ine (localStorage `ak_draw_${sym}`,
// bkz. Chart.jsx satır ~601) EKLEME yapar — Chart.jsx'in çizim mantığına hiç dokunulmaz, mevcut
// "position" (giriş/TP/SL kutusu) ve "hline" (yatay seviye) araçları OLDUĞU GİBİ yeniden kullanılır.
// Kullanıcının kendi mevcut çizimlerinin ÜZERİNE YAZILMAZ — yalnız eklenir (ve aynı seviye zaten
// varsa tekrar eklenmez, "grafikte gör"e ikinci kez basmak çizimi çoğaltmaz).

function loadDraws(sym, store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s) return [];
  try {
    const a = JSON.parse(s.getItem(`ak_draw_${sym}`));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveDraws(sym, list, store) {
  const s = store || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s) return;
  try { s.setItem(`ak_draw_${sym}`, JSON.stringify(list)); } catch { /* kotayı aşarsa sessiz geç */ }
}
function uid() { return "ak102-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// SAF fonksiyon: mevcut çizimler + hedef seviyeler -> eklenecek yeni çizimler (varsa boş dizi —
// aynı entry/tp/sl'ye sahip bir position kutusu zaten varsa tekrar eklenmez).
export function buildHandoffDraws(existingDraws, anchorIdx, { entry, stop, hedef1, hedef2 }) {
  const already = existingDraws.some(
    (d) => d.type === "position" && d.entry === entry && d.tp === hedef1 && d.sl === stop
  );
  if (already) return [];
  const out = [{ id: uid(), locked: false, type: "position", i: anchorIdx, entry, tp: hedef1, sl: stop }];
  if (Number.isFinite(hedef2) && hedef2 !== hedef1) {
    out.push({ id: uid(), locked: false, type: "hline", price: hedef2 });
  }
  return out;
}

// sym'in grafiğine bu sinyalin seviyelerini ekler (append-only, Chart.jsx bir sonraki açılışında
// otomatik yükler — ayrı bir state/prop aktarımına gerek yok, aynı localStorage anahtarı paylaşılır).
export function seedChartLevels(sym, anchorIdx, levels, store) {
  const existing = loadDraws(sym, store);
  const additions = buildHandoffDraws(existing, anchorIdx, levels);
  if (additions.length) saveDraws(sym, [...existing, ...additions], store);
  return additions;
}
