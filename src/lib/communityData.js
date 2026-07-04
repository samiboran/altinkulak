// Topluluk verisi + Edge Skoru.
// Felsefe: lider tablosu KAZANÇ ORANINA degil, dogrulanmis EDGE'e odul verir.
// Edge Skoru = clamp(t,0,6)/6 * 100 * guven;  guven = min(1, oosTrades/30).
// Boylece: yuksek kazanc orani tek basina hicbir sey kazandirmaz; istatistik kazandirir.

export function edgeScore({ tStat, oosTrades }) {
  const tNorm = Math.max(0, Math.min(tStat, 6)) / 6;
  const confidence = Math.min(1, oosTrades / 30);
  return Math.round(tNorm * 100 * confidence);
}

// Ornek stratejiler (ileride Supabase'den gelecek - AK-007).
// Dikkat: "trap" isaretliler yuksek kazanc orani + dusuk t = ustte gorunmemeli.
export const STRATEGIES = [
  { user: "elifquant",   sym: "SOL", setup: "FVG",        rr: 3, win: 61, oos: 38, t: 3.6, forks: 142 },
  { user: "mertfx",      sym: "ETH", setup: "FVG",        rr: 2, win: 64, oos: 31, t: 3.1, forks: 88 },
  { user: "deniz_algo",  sym: "BTC", setup: "FVG",        rr: 2, win: 58, oos: 44, t: 2.9, forks: 76 },
  { user: "pumpkral",    sym: "AVAX",setup: "Sweep",      rr: 5, win: 78, oos: 9,  t: 1.2, forks: 210, trap: true },
  { user: "cansu.t",     sym: "SOL", setup: "Order Block",rr: 3, win: 66, oos: 22, t: 2.4, forks: 54 },
  { user: "borsaci34",   sym: "BTC", setup: "FVG",        rr: 2, win: 71, oos: 7,  t: 1.0, forks: 165, trap: true },
  { user: "kaan_sys",    sym: "ETH", setup: "FVG",        rr: 3, win: 55, oos: 29, t: 2.2, forks: 41 },
  { user: "zeynep.v",    sym: "SOL", setup: "FVG",        rr: 2, win: 60, oos: 35, t: 2.7, forks: 63 },
  { user: "ay_trader",   sym: "XRP", setup: "Sweep",      rr: 4, win: 74, oos: 11, t: 1.5, forks: 97, trap: true },
  { user: "okan_dev",    sym: "BTC", setup: "FVG",        rr: 2, win: 57, oos: 33, t: 2.5, forks: 38 },
];

// Uye kartlari (AK-019 devami — demo; AK-006 auth sonrasi gercek veriden).
// Tasarim kurallari:
//  - memberNo: kacinci uye (davet ekonomisiyle erken numara prestijdir)
//  - job: kullanici ACIK ETTIYSE gorunur, yoksa null (gizlilik varsayilan)
//  - isabet TEK BASINA gosterilmez: her zaman n islem + toplam R baglami yaninda
//  - focus: beyan degil DAVRANIS — islemlerinin piyasa dagilimindan (%)
export const MEMBERS = {
  elifquant:  { memberNo: 4,   job: "Veri bilimci",       edge: "Usta",   contrib: "Eğitimci", n: 214, hit: 58, totalR: 38.2, focus: { Kripto: 71, ABD: 22, BIST: 7 } },
  mertfx:     { memberNo: 11,  job: null,                  edge: "Kalfa",  contrib: "Katkıcı",  n: 122, hit: 61, totalR: 21.4, focus: { Kripto: 88, ABD: 9,  BIST: 3 } },
  deniz_algo: { memberNo: 7,   job: "Yazılım mühendisi",  edge: "Usta",   contrib: "Katkıcı",  n: 187, hit: 55, totalR: 31.0, focus: { Kripto: 64, ABD: 30, BIST: 6 } },
  pumpkral:   { memberNo: 156, job: null,                  edge: "Aday",   contrib: "Gözlemci", n: 19,  hit: 78, totalR: 3.1,  focus: { Kripto: 97, ABD: 3,  BIST: 0 } },
  "cansu.t":  { memberNo: 23,  job: "Mimar",               edge: "Kalfa",  contrib: "Katkıcı",  n: 96,  hit: 60, totalR: 15.8, focus: { Kripto: 41, ABD: 12, BIST: 47 } },
  borsaci34:  { memberNo: 201, job: null,                  edge: "Aday",   contrib: "Gözlemci", n: 24,  hit: 71, totalR: 2.4,  focus: { BIST: 76, Kripto: 20, ABD: 4 } },
  kaan_sys:   { memberNo: 38,  job: "Elektrik mühendisi", edge: "Kalfa",  contrib: "Gözlemci", n: 104, hit: 54, totalR: 13.9, focus: { ABD: 58, Kripto: 33, BIST: 9 } },
  "zeynep.v": { memberNo: 15,  job: null,                  edge: "Kalfa",  contrib: "Öğretmen", n: 141, hit: 59, totalR: 19.6, focus: { Kripto: 52, ABD: 41, BIST: 7 } },
  ay_trader:  { memberNo: 178, job: null,                  edge: "Aday",   contrib: "Gözlemci", n: 27,  hit: 74, totalR: 4.0,  focus: { Kripto: 92, ABD: 8,  BIST: 0 } },
  okan_dev:   { memberNo: 9,   job: "Ürün yöneticisi",    edge: "Kalfa",  contrib: "Katkıcı",  n: 118, hit: 56, totalR: 17.2, focus: { ABD: 49, Kripto: 44, BIST: 7 } },
};

// Baskın odak: "Kripto ağırlıklı (%71)" gibi
export function focusLabel(focus) {
  const top = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} ağırlıklı (%${top[1]})` : null;
}
