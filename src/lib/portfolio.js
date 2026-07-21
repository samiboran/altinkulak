// AK-078: kişisel portföy — İzleme listesinin "bak" halinden "takip et" haline geçişi.
// TASARIM İLKESİ (D9): event sourcing. Tek gerçek kaynak portfolio_events log'udur; mevcut
// durum (portfolio_items — sembol başına adet + ağırlıklı ortalama maliyet) HER ZAMAN bu log'dan
// TÜRETİLİR, ayrıca saklanmaz. Bu, ledger.js'in "append-only, silme yok" dürüstlük ilkesiyle
// aynı ailede: geçmiş asla üzerine yazılmaz, yalnız yeni event eklenir (remove dahi bir event'tir).
//
// D8: iç saklama USD normalize. Kullanıcı TRY (ya da başka bir birimde) girerse, o andaki kur
// fx_rate_at_entry olarak event'e yazılır (denetim/şeffaflık için) VE anında USD'ye çevrilip
// cost_usd olarak saklanır — sonraki tüm hesaplamalar (ort. maliyet, K/Z) tek para biriminde,
// tutarlı kalır.
//
// Depolama: v1 localStorage (ak_portfolio_events_v1). Supabase şeması AŞAĞIDA yorum olarak
// hazırdır ama BAĞLANMAZ (kasıtlı — bu sürümde kullanıcı hesabı olmadan da çalışsın).
//
// -- Supabase şeması (v2, bağlanmadı):
// -- create table portfolio_events (
// --   id uuid primary key default gen_random_uuid(),
// --   user_id uuid not null references profiles(id) on delete cascade,
// --   item_key text not null,            -- `${asset_type}:${symbol}`
// --   symbol text not null, asset_type text not null,
// --   type text not null,                -- 'add' | 'remove' | 'update_cost'
// --   qty numeric not null default 0,
// --   cost_usd numeric not null default 0,   -- birim başına USD (normalize edilmiş)
// --   fee_usd numeric not null default 0,
// --   currency_entered text not null default 'USD',
// --   fx_rate_at_entry numeric not null default 1,
// --   ts bigint not null                 -- epoch ms, kullanıcı geçmiş tarihli işlem girebilir
// -- );
// -- alter table portfolio_events enable row level security;
// -- create policy "portfolio_events all own" on portfolio_events for all
// --   using (auth.uid() = user_id) with check (auth.uid() = user_id);

const EVKEY = "ak_portfolio_events_v1";

export const ASSET_TYPES = ["crypto", "bist", "us"];
export const EVENT_TYPES = ["add", "remove", "update_cost"];

export function itemKey(symbol, assetType) {
  return `${assetType}:${String(symbol).toUpperCase()}`;
}

// AK-101 Bug1/2: "İşlem ekle" modalının kaydet butonu aktif/pasif durumu — SAF fonksiyon, UI ve
// test aynı mantığı paylaşır. Önceden buton her zaman tıklanabilirdi ve geçersiz girdide yalnız
// küçük bir hata metni gösteriyordu ("tepki vermiyor" hissi) — artık geçersizken baştan pasif.
export function canSubmitTransaction({ assetType, isBist, price, qty }) {
  if (!assetType || isBist) return false;
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isFinite(qty) || qty <= 0) return false;
  return true;
}

function loadEvents() {
  if (typeof localStorage === "undefined") return [];
  try {
    const a = JSON.parse(localStorage.getItem(EVKEY));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveEvents(list) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(EVKEY, JSON.stringify(list)); } catch { /* kotayı aşarsa sessiz geç */ }
}
function newId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
}

// D8: USD normalize — SAF fonksiyon, test edilebilir. currency 'USD' ise fx 1 kabul edilir
// (çevrimin kendisi anlamsız ama alan yine de tutarlı kalsın diye 1 yazılır).
// fxRate anlamı UI ile tutarlı: "1 USD = fxRate TRY" (bkz. PortfolioPanel modalındaki "Kur (1 USD=?₺)")
// — yani TRY'den USD'ye çevrim BÖLME'dir: 3400 TRY, kur 34 iken 100 USD eder (3400/34), 3400*34 DEĞİL.
export function normalizeToUSD(amountNative, currency, fxRate) {
  const amt = Number(amountNative) || 0;
  if (currency === "USD") return { amountUsd: amt, fxRateUsed: 1 };
  const fx = Number(fxRate) > 0 ? Number(fxRate) : 1;
  return { amountUsd: amt / fx, fxRateUsed: fx };
}

// UI her zaman bunu çağırır, ham event obje oluşturmaz.
// price_native/fee_native: kullanıcının girdiği para biriminde birim fiyat/işlem ücreti.
export function addTransaction({ symbol, assetType, type, qty, priceNative, currency = "USD", fxRate = 1, feeNative = 0, ts = Date.now() }) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym || !ASSET_TYPES.includes(assetType) || !EVENT_TYPES.includes(type)) return null;
  const q = Number(qty), price = Number(priceNative);
  if (type !== "update_cost" && (!Number.isFinite(q) || q <= 0)) return null;
  // AK-101 Bug3: price===0 önceden kabul ediliyordu — 0 maliyetli bir kalem sonradan gerçek
  // fiyatla karşılaştırılınca anlamsız/sonsuz K/Z yüzdesi üretebilir, reddedilmeli.
  if (!Number.isFinite(price) || price <= 0) return null;
  const { amountUsd: costUsd, fxRateUsed } = normalizeToUSD(price, currency, fxRate);
  const { amountUsd: feeUsd } = normalizeToUSD(feeNative, currency, fxRate);
  const event = {
    id: newId(),
    item_key: itemKey(sym, assetType),
    symbol: sym,
    asset_type: assetType,
    type,
    qty: type === "update_cost" ? 0 : Math.abs(q),
    cost_usd: costUsd,
    fee_usd: feeUsd,
    currency_entered: currency === "USD" ? "USD" : currency,
    fx_rate_at_entry: fxRateUsed,
    ts: Number(ts) || Date.now(),
  };
  const all = loadEvents();
  all.push(event);
  saveEvents(all);
  return event;
}

// D9: mevcut durum log'dan türetilir — event'ler ts sırasına göre (eşitlikte log sırasına göre,
// Array.sort STABLE olduğundan bu güvenli) tek tek uygulanır. SAF fonksiyon — test edilebilir.
export function deriveItems(events) {
  const sorted = [...events].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const state = new Map(); // item_key -> {symbol, asset_type, qty, avg_cost_usd, created_at}
  for (const ev of sorted) {
    const key = ev.item_key || itemKey(ev.symbol, ev.asset_type);
    const s = state.get(key) || { symbol: ev.symbol, asset_type: ev.asset_type, qty: 0, avg_cost_usd: 0, created_at: ev.ts };
    if (ev.type === "add") {
      const addedQty = Number(ev.qty) || 0;
      const addedCost = addedQty * (Number(ev.cost_usd) || 0) + (Number(ev.fee_usd) || 0); // U3: fee maliyete dahil
      const newQty = s.qty + addedQty;
      s.avg_cost_usd = newQty > 0 ? (s.qty * s.avg_cost_usd + addedCost) / newQty : 0;
      s.qty = newQty;
    } else if (ev.type === "remove") {
      // Ağırlıklı ortalama maliyet satışta DEĞİŞMEZ (standart cost-basis kuralı) — yalnız adet düşer.
      s.qty = Math.max(0, s.qty - (Number(ev.qty) || 0));
    } else if (ev.type === "update_cost") {
      s.avg_cost_usd = Number(ev.cost_usd) || 0;
    }
    state.set(key, s);
  }
  return [...state.entries()]
    .map(([key, s]) => ({ key, ...s }))
    .filter((s) => s.qty > 1e-9); // tamamen satılmış kalemler listeden düşer
}

export function getItems() {
  return deriveItems(loadEvents());
}

// itemKeyFilter verilirse yalnız o kaleme ait geçmiş (en yeni en üstte) — satır tıklayınca timeline için.
export function listEvents(itemKeyFilter = null) {
  const all = loadEvents();
  const filtered = itemKeyFilter ? all.filter((e) => e.item_key === itemKeyFilter) : all;
  return filtered.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
