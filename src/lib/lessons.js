// Eğitim içeriği — "Sıfırdan Başla" kiti. Gerçek ders metinleri.
// İleride contributor'lar da ders ekleyebilir (AK: contributor sistemi).
// Her ders: slug, başlık, süre, video(placeholder), bölümler, anahtar çıkarımlar,
// uygula: lab'da ön-dolu açılacak strateji (symbol/setup).

export const LESSONS = [
  {
    slug: "piyasa-nedir",
    n: "01",
    title: "Piyasa nedir, fiyat nasıl oluşur",
    dur: "08:20",
    summary: "Arz, talep ve likidite — fiyatın arkasındaki üç kuvvet.",
    sections: [
      { h: "Fiyat bir anlaşmadır", p: "Bir hisse ya da kripto için 'fiyat' dediğimiz şey, o an alıcıyla satıcının üzerinde anlaştığı son sayıdır. Kimse fiyatı tek başına belirlemez; her işlem iki tarafın aynı sayıda buluşmasıdır. Bu yüzden fiyat sürekli oynar: her yeni işlem, dengeyi biraz kaydırır." },
      { h: "Arz ve talep", p: "Alıcılar satıcılardan daha istekliyse (talep > arz) fiyat yukarı, tersi olursa aşağı gider. Grafikteki her hareket, aslında bu dengenin görünür halidir. 'Yükseliyor' demek, o anda alıcıların satıcılardan daha agresif olması demektir." },
      { h: "Likidite: işin görünmeyen tarafı", p: "Likidite, bir varlığı fiyatı fazla bozmadan alıp satabilme kolaylığıdır. BIST'te ASELSAN gibi yüksek hacimli bir hisse likittir; küçük bir şirket değildir. Likidite düşükse, küçük bir emir bile fiyatı sert oynatır. Profesyoneller fiyattan önce likiditeye bakar — çünkü çıkış yapamayacağın bir pozisyon, kâğıt üstünde kazançtır." },
    ],
    takeaways: [
      "Fiyat = o anki alıcı-satıcı anlaşması, sabit bir gerçek değil.",
      "Hareketin yönü arz-talep dengesinin kayması.",
      "Likidite olmadan kazanç kâğıt üstünde kalır.",
    ],
    apply: null,
  },
  {
    slug: "mum-grafigi",
    n: "02",
    title: "Mum grafiğini okumak",
    dur: "11:05",
    summary: "OHLC: açılış, en yüksek, en düşük, kapanış — bir mum ne anlatır.",
    sections: [
      { h: "Bir mumun dört sayısı", p: "Her mum bir zaman dilimini özetler (örneğin 1 saat). Dört bilgi taşır: açılış (open), o dilimdeki en yüksek (high), en düşük (low) ve kapanış (close). Gövde açılışla kapanış arasını, fitiller ise uçlara uzanan ince çizgiler en yüksek/en düşüğü gösterir." },
      { h: "Gövde ve fitil ne söyler", p: "Uzun gövde, o dilimde bir tarafın net kazandığını söyler. Uzun bir alt fitil, fiyatın aşağı itildiğini ama alıcıların geri topladığını gösterir — talebin orada güçlü olduğunun işareti. Fitiller çoğu zaman gövdeden daha çok şey anlatır: reddedilen seviyeleri işaret ederler." },
      { h: "Tek mum değil, bağlam", p: "Tek bir mum nadiren karar verdirir. Önemli olan mumun nerede oluştuğu: bir destek bölgesinde mi, bir boşluğun kenarında mı? Aynı mum farklı yerlerde farklı şey anlatır. Sonraki derslerde bu bağlamı (FVG) kuracağız." },
    ],
    takeaways: [
      "Her mum = açılış, yüksek, düşük, kapanış.",
      "Fitiller reddedilen seviyeleri gösterir, çoğu zaman gövdeden değerli.",
      "Tek mum değil, oluştuğu yer (bağlam) önemli.",
    ],
    apply: null,
  },
  {
    slug: "fvg-nedir",
    n: "03",
    title: "FVG (Fair Value Gap) nedir",
    dur: "13:40",
    summary: "Fiyatın hızlı geçtiği boşluk; neden geri döner, nasıl test edilir.",
    sections: [
      { h: "Boşluk nasıl oluşur", p: "Fiyat bazen o kadar hızlı hareket eder ki, üç ardışık mumda bir 'boşluk' bırakır: ortadaki mum o kadar güçlüdür ki, birinci mumun en yükseği ile üçüncü mumun en düşüğü arasında dokunulmamış bir bölge kalır. İşte bu Fair Value Gap — 'adil değer boşluğu'. Mantık şu: fiyat oradan o kadar hızlı geçti ki, alıcı-satıcı dengesi orada tam kurulamadı." },
      { h: "Neden geri döner (retest)", p: "Tez şudur: fiyat sık sık o boşluğa geri dönüp 'eksik kalan işlemleri' tamamlar, sonra asıl yönüne devam eder. Bu geri dönüşe retest denir. FVG stratejisinin girişi tam burada: boşluğa dönüşte pozisyon al, trend yönünde devamı yakala." },
      { h: "Her boşluk işe yaramaz", p: "İşte kritik nokta — ve Altınkulak'ın farkı. Her FVG kazandırmaz. Bizim araştırmamız gösterdi ki edge yalnızca dar (ATR'nin yarısından küçük) ve trend yönündeki boşluklarda yaşıyor. Geniş, gürültülü boşluklar rastgeleden farksız. Bir sonraki derste bunu lab'da kendi gözünle test edeceksin." },
    ],
    takeaways: [
      "FVG = üç mumda fiyatın hızlı geçip bıraktığı dokunulmamış boşluk.",
      "Tez: fiyat boşluğu retest eder, sonra trend yönünde devam eder.",
      "Edge sadece dar + trend yönlü boşlukta; geniş boşluk gürültü.",
    ],
    apply: { symbol: "SOL", setup: "FVG", rr: 2 },
  },
  {
    slug: "t-istatistigi",
    n: "04",
    title: "t-istatistiği: kendini kandırmamak",
    dur: "16:10",
    summary: "%70 kazanç oranı neden yeterli değil; bir edge gerçek mi tesadüf mü.",
    sections: [
      { h: "Kazanç oranı yalan söyleyebilir", p: "Bir strateji 10 işlemde 7 kazanırsa kazanç oranı %70 görünür — etkileyici. Ama 10 işlem çok az. Bir parayı 10 kez atıp 7 yazı gelmesi hiç de olağanüstü değil. Yani yüksek kazanç oranı, az örnekle, hiçbir şey kanıtlamaz. Piyasada çoğu kişi tam burada kendini kandırır." },
      { h: "t-istatistiği ne yapar", p: "t-istatistiği şu soruyu sayıyla yanıtlar: 'Bu sonuç, sıfır edge'i olan rastgele bir stratejiden ne kadar uzak?' Kabaca, ortalama getiriyi getirilerin oynaklığına ve işlem sayısına göre ölçer. Kuralımız: t ≥ 2 değilse, sonuç rastgeleden güvenle ayrılamaz. t ne kadar yüksekse, edge'in tesadüf olma ihtimali o kadar düşük." },
      { h: "Out-of-sample ve kontrol grubu", p: "Bir adım daha: veriyi ikiye böleriz (70 eğitim / 30 test). Strateji sadece görmediği test verisinde de çalışmalı — yoksa sadece geçmişe uydurulmuş demektir. Üstüne, aynı sayıda rastgele işlemle bir kontrol grubu kurarız. Gerçek strateji bu rastgele grubu net aşmalı. Lab'daki 'Edge yok' uyarısı tam bu üç filtreden geçemeyen kurulumlar için çıkar." },
    ],
    takeaways: [
      "Az örnekle yüksek kazanç oranı hiçbir şey kanıtlamaz.",
      "t ≥ 2: sonuç rastgeleden güvenle ayrılıyor demek.",
      "Out-of-sample + rastgele kontrol grubu = kendini kandırmama kalkanı.",
    ],
    apply: { symbol: "RND", setup: "FVG", rr: 2 },
  },
];

export function getLesson(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}
