// AK-074: piyasa değerine göre ilk 500 kripto para — arama/otomatik-tamamlama içindir.
// CoinGecko keyless public API (anahtar/hesap gerekmez): /coins/markets, market_cap_desc,
// 250'şer barlık 2 sayfa = 500. localStorage'da 24 saat önbellekler (kripto sıralaması
// saatlik değişmez, gereksiz istek atılmaz). Ağ hatasında elde ne varsa (boş dizi dahil) döner —
// çağıran (data.js) bunu ALL_SYMBOLS'a KARIŞTIRMAZ, ayrı bir arama listesi olarak tutar.
const LS_KEY = "ak_top500_v1";
const TTL = 24 * 60 * 60 * 1000;

function loadCache() {
  if (typeof localStorage === "undefined") return null;
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY));
    if (c && Array.isArray(c.list) && Date.now() - c.ts < TTL) return c.list;
  } catch { /* bozuk önbellek — yeniden çek */ }
  return null;
}
function saveCache(list) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), list })); } catch { /* kota dolu — önemsiz */ }
}

// CoinGecko /coins/markets ham satırını {sym,name} çevirir (saf fonksiyon — test edilir).
export function normalizeTop500(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && c.symbol)
    .map((c) => ({ sym: String(c.symbol).toUpperCase(), name: c.name || c.symbol.toUpperCase() }));
}

export async function fetchTop500() {
  const cached = loadCache();
  if (cached) return cached;

  const all = [];
  for (const page of [1, 2]) {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const raw = await r.json();
      all.push(...normalizeTop500(raw));
    } catch { /* ağ hatası — o sayfa atlanır, elde ne varsa döner */ }
  }
  if (all.length) saveCache(all);
  return all;
}
