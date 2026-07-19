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
  {
    slug: "hareketli-ortalamalar",
    n: "05",
    title: "Hareketli ortalamalar: 50 ve 200 günlük",
    dur: "10:15",
    summary: "Fiyatın gürültüsünü süzen çizgi — trend yönü ve 'golden cross' ne anlatır, ne anlatmaz.",
    sections: [
      { h: "Ortalama neden işe yarar", p: "50 günlük hareketli ortalama (MA50), son 50 günün kapanış fiyatlarının ortalamasıdır — her yeni gün eklenip en eskisi düşer, çizgi kayarak ilerler. Tek başına bir fiyat gürültülüdür: bir gün sert yukarı, ertesi gün sert aşağı gidebilir. Ortalama bu gürültüyü yumuşatır, geriye trendin kendisini bırakır. 200 günlük ortalama (MA200) aynı mantığı daha uzun vadede yapar — kısa dalgalanmaları değil, yılın genel yönünü gösterir." },
      { h: "Golden cross ve death cross", p: "MA50, MA200'ün üstüne çıktığında buna 'golden cross' denir — kısa vadeli ortalama uzun vadelinin üstüne geçmiştir, piyasa dilinde 'momentum yukarı döndü' yorumu yapılır. Tersi (MA50 aşağı kesip geçerse) 'death cross'tur. Bu isimler kulağa büyülü gelse de aslında söyledikleri basit: kısa vadeli ortalama, uzun vadeliyi geçti. Kendinden bir kehanet gücü yoktur, sadece bir gecikme göstergesidir — çünkü ortalama, geçmiş fiyatların ortalamasıdır, geleceği görmez." },
      { h: "Altınkulak'ın farkı: gecikme her zaman vardır", p: "MA50/MA200 kesişimi haber olduğunda, fiyat zaten günler önce o yönde hareket etmeye başlamıştır — ortalama by design geriden gelir. Bizim testlerimiz gösteriyor ki çıplak golden cross sinyali tek başına, geniş piyasalarda rastgeleden anlamlı şekilde ayrışmıyor (t-istatistiği zayıf kalıyor). İşe yaradığı yer: bir filtre olarak. Örneğin FVG girişini sadece MA50 üstündeyken (trend yönünde) almak, aşağı yönde almaktan farklı sonuç veriyor — MA burada tek başına sinyal değil, bağlam sağlıyor." },
    ],
    takeaways: [
      "MA50/MA200 = son N günün ortalaması, gürültüyü süzer, trend yönünü gösterir.",
      "Golden/death cross gecikmeli bir göstergedir — kehanet değil, geçmişin özeti.",
      "Tek başına zayıf sinyal; trend filtresi olarak (örn. FVG ile birlikte) kullanınca değer katıyor.",
    ],
    apply: null,
  },
  {
    slug: "fibonacci-ote",
    n: "06",
    title: "Fibonacci geri çekilme ve OTE bölgesi",
    dur: "12:30",
    summary: "%61.8 neden özel görünüyor; OTE (Optimal Trade Entry) bölgesi nasıl kullanılır, nasıl kullanılmaz.",
    sections: [
      { h: "Geri çekilme seviyeleri nereden geliyor", p: "Fiyat bir yönde güçlü hareket ettikten sonra genelde biraz geri çekilir, sonra devam eder ya da tersine döner. Fibonacci geri çekilme araçları bu hareketin başından sonuna bir çizgi çeker, aradaki mesafeyi belirli oranlara (%23.6, %38.2, %50, %61.8, %78.6) böler. Bu oranlar Fibonacci dizisinden (her sayı bir öncekinin altın oranına yakın) türetilir — matematiksel olarak zarif ama piyasada 'sihirli' olduklarını gösteren bağımsız bir kanıt yok, sadece çok sayıda kişi aynı seviyelere baktığı için kendini gerçekleştiren bir beklenti oluşabiliyor." },
      { h: "OTE bölgesi ne demek", p: "OTE (Optimal Trade Entry), genellikle %61.8 ile %78.6 arasındaki dar bandı işaret eder — fikir şu: fiyat bu bölgeye geri çekilirse, trend yönünde devam etme ihtimali diğer seviyelere göre biraz daha yüksek görülür. Altınkulak'ın motorunda OTE, tek başına bir giriş sebebi değil, bir 'bölge filtresi'dir — fiyatın bu aralığa girip girmediğini test eder, girdiyse diğer oluşumlarla (FVG, order block gibi) birleştirir." },
      { h: "Altınkulak'ın farkı: seviye başına değil, kombinasyona bak", p: "Testlerimizde çıplak OTE dokunuşu (sadece fiyat o bölgeye girdi diye işlem açmak) tutarlı bir edge göstermiyor. Ama OTE + dar FVG + trend yönü birlikte kullanıldığında sonuçlar anlamlı şekilde değişiyor (Mod B v1.1'in temeli tam bu). Ders şu: Fibonacci seviyeleri tek başına bir strateji değil, bir bileşendir — Strateji Çıkarıcı'da bir bölge seçtiğinde OTE'yi diğer oluşumlarla birlikte gördüğünde, o kombinasyonun geçmişte gerçekten işe yarayıp yaramadığını OOS testiyle doğrulaman gerekiyor, sadece seviyeye güvenmek yeterli değil." },
    ],
    takeaways: [
      "Fibonacci oranları matematiksel köken taşır ama piyasadaki gücü kısmen kendini gerçekleştiren beklentiden gelir.",
      "OTE (%61.8-%78.6) tek başına giriş sebebi değil, bir bölge filtresidir.",
      "Edge, OTE'nin diğer oluşumlarla (FVG, trend) birleştiği kombinasyonda yaşıyor — tek seviyede değil.",
    ],
    apply: null,
  },
];

export function getLesson(slug) {
  return LESSONS.find((l) => l.slug === slug) || null;
}
