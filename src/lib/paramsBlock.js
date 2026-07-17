// AK-084/C1: AK-PARAMS blok sözleşmesi.
// Görsel editör (Pozisyon/FVG kutuları) kullanıcı kodundaki YALNIZ bu bloğu okur/yazar.
// Serbest kod bölgesine asla dokunulmaz — parse edilemeyen blokta mevcut kod korunur.
//
// Blok biçimi (kodun herhangi bir yerinde, tercihen başta):
//   // AK-PARAMS (görsel editörle senkron — elle de düzenlenebilir)
//   const PARAMS = { fvgMinAtr: 0.3, ote: 0.62, slR: 2.0, tpR: 5.0 };

const MARKER = "// AK-PARAMS";
const BLOCK_RE = /\/\/ AK-PARAMS[^\n]*\n\s*const PARAMS = \{([^}]*)\};/;

// Yalnız `anahtar: sayı|true|false|"metin"` çiftleri kabul edilir — eval YOK, güvenli parse.
const PAIR_RE = /([A-Za-z_$][\w$]*)\s*:\s*(-?\d+(?:\.\d+)?|true|false|"(?:[^"\\]|\\.)*")/g;

export function hasParamsBlock(code) {
  return BLOCK_RE.test(code || "");
}

// Bloktan parametreleri çıkarır. Blok yoksa veya hiçbir çift parse edilemezse null.
export function extractParams(code) {
  const m = (code || "").match(BLOCK_RE);
  if (!m) return null;
  const params = {};
  let found = false;
  for (const [, key, raw] of m[1].matchAll(PAIR_RE)) {
    found = true;
    if (raw === "true") params[key] = true;
    else if (raw === "false") params[key] = false;
    else if (raw.startsWith('"')) params[key] = JSON.parse(raw);
    else params[key] = Number(raw);
  }
  return found ? params : null;
}

function serialize(params) {
  const body = Object.entries(params)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join(", ");
  return `${MARKER} (görsel editörle senkron — elle de düzenlenebilir)\nconst PARAMS = { ${body} };`;
}

// Bloktaki parametreleri günceller (mevcutla birleştirir). Blok yoksa kodun BAŞINA ekler.
// Serbest kod bölgesi bayt bayt korunur — yalnız işaretli blok yeniden yazılır.
export function upsertParams(code, updates) {
  const src = code || "";
  const current = extractParams(src) || {};
  const merged = { ...current, ...updates };
  const block = serialize(merged);
  if (BLOCK_RE.test(src)) return src.replace(BLOCK_RE, block);
  return block + "\n\n" + src;
}

// Görsel kutulardan R hesapları: giriş/SL/TP fiyatlarından slR-tpR türet (yön farketmez).
export function ratiosFromLevels(entry, sl, tp) {
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return null;
  return { slR: 1, tpR: +(Math.abs(tp - entry) / risk).toFixed(2) };
}
