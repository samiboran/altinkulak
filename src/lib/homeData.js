// Ana sayfa verisi + osiloskop dalga formu yardimcilari.
// DOKUNULMAZ: smoothstep / pseudo / buildWave mantigina dokunma.

export function smoothstep(a, b, t) {
  const u = Math.min(Math.max((t - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
}
export function pseudo(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1; // [-1,1]
}
export function buildWave() {
  const W = 1000, mid = 100;
  let d = "";
  for (let x = 0; x <= W; x += 5) {
    const t = x / W;
    const blend = smoothstep(0.30, 0.74, t);
    const clean = 38 * Math.sin(x * 0.042);
    const noise = pseudo(x) * 52 * (1 - blend);
    const y = mid - (clean * blend + noise);
    d += (x === 0 ? "M" : "L") + x + " " + y.toFixed(1) + " ";
  }
  return d.trim();
}
export const TIP_Y = 100 - 38 * Math.sin(1000 * 0.042);

export const TABS = [
  { key: "one", label: "Öne Çıkan", tag: "Bu hafta" },
  { key: "market", label: "Piyasa", tag: "BIST + Kripto" },
  { key: "edu", label: "Eğitim", tag: "Sıfırdan başla" },
  { key: "comm", label: "Topluluk", tag: "Trend videolar" },
  { key: "ai", label: "AI & Haber", tag: "Özetlenmiş" },
];

export const HERO = {
  one:    { h: "Gürültüyü değil, sinyali duy.", s: "Türkçe, yapay zekâ destekli strateji laboratuvarı. Kur, test et — istatistik yalan söylemez." },
  market: { h: "Piyasayı izle, dokunarak öğren.", s: "BIST ve kripto, videolu günlük özetlerle. Gördüğün setup’ı aynı anda kendi panelinde dene." },
  edu:    { h: "İzlerken uygula, gerçekten öğren.", s: "Ders bir yanda oynar, strateji öbür yanda canlı. Bilgi izlemekle değil, yapmakla kalır." },
  comm:   { h: "Sinyali bulanlar üste çıksın.", s: "Lider tablosu işlem sayısına değil, doğrulanmış edge’e ödül verir. Pump yok, kanıt var." },
  ai:     { h: "Haberi yapay zekâ süzsün.", s: "AI, finans ve teknoloji akışını senin için özetler. Önemliyi gürültüden ayırır." },
};

export const CARDS = [
  { n: "01", icon: "PlayCircle",    title: "Videolu Piyasa",        desc: "Günün BIST & kripto özeti, kısa video.", chip: "Yeni", to: "/haberler#piyasa" },
  { n: "02", icon: "Newspaper",     title: "AI & Finans Haberleri", desc: "Yapay zekâ ile süzülmüş finans akışı.", chip: null, to: "/haberler#finans" },
  { n: "03", icon: "Cpu",           title: "Teknoloji Haberleri",   desc: "Sektörü ve teknolojiyi takip et.", chip: null, to: "/haberler#teknoloji" },
  { n: "04", icon: "FlaskConical",  title: "Haftanın Stratejisi",   desc: "Lab’dan öne çıkan, doğrulanmış setup.", chip: "t = 2.3", to: "/lab" },
  { n: "05", icon: "GraduationCap", title: "Eğitim · Başla",        desc: "Temel ekonomiden ileri analize kit’ler.", chip: null, to: "/ogren" },
  { n: "06", icon: "Users",         title: "Topluluk",              desc: "Trend videolar, strateji paylaş & fork’la.", chip: null, to: "/topluluk" },
  { n: "07", icon: "Target",        title: "Haftanın Tahmini",      desc: "Yönünü tahmin et, güvenini ölç — Tahmin Ligi.", chip: "Yeni", to: "/lig" },
];
