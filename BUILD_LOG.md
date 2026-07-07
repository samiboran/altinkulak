# Altınkulak — İlerleme Kaydı & Handoff Sırası

> Sohbet tarafı (Opus) iskelet/karar/motor üretir → Claude Code kalan derin özellikleri tamamlar.
> Her görev = JSON sözleşme + insan-okunur mapping.

---

## ✅ TAMAMLANDI (dosyalar hazır, `npm run build` temiz)

**AK-001 — Vite iskeleti + homepage port.** Çalışan proje, routing, kalıcı Navbar/Footer, 11 route. Home 6 bileşene bölündü; `.ak-grid` svg çakışması `.ak-scope-grid` ile temizlendi. 8 stub sayfa PageShell ile.

**AK-002 — /lab UI + dürüstlük paneli.** Sembol/kurulum/RR seçimi, sonuç + verdict.

**AK-003 — GERÇEK backtest motoru.** `src/lib/stats.js` (t-stat, 70/30 split, verdict — pozitif/kârlı t şartı) + `src/lib/backtest.js` (ATR ölçekli FVG tespiti, retest girişi, **lookahead-bias engelli** simülasyon, **rastgele giriş kontrol grubu** aynı stop/target makinesiyle). Lab artık mock değil, gerçek hesaplıyor + equity curve çiziyor.
> Doğrulama: BTC t=5, ETH t=4.4, SOL t=3.4 → EDGE; RND t=0.5 → gürültü (doğru reddediliyor). Kazanç oranı %70 olsa bile istatistik geçmezse "edge yok" diyor — tasarımın çekirdeği bu.

**AK-004 (statik faz) — Örnek veri katmanı.** `src/lib/data.js`: deterministik OHLC, içine GERÇEK "retest sonrası devam" düzenliliği gömülü (SOL>ETH>BTC; RND düz rastgele). İleride gerçek gecikmeli API ile değişecek.

**AK-005 — İzle & Uygula tam bağ.** `src/components/LabEmbed.jsx` Ogren sağ paneline gömüldü; ders bağlamıyla (SOL/FVG) ön-dolu, "Bu dersi test et" gerçek motoru çalıştırıyor.

**AK-008 — Topluluk + edge-ödüllü leaderboard.** `src/lib/communityData.js` (Edge Skoru = clamp(t,0,6)/6×100×güven) + `src/pages/Topluluk.jsx`. Sıralama kazanç oranına DEĞİL edge'e göre. "Kazanç oranı"na göre sırala toggle'ı, naif sıralamanın yüksek-kazanç/düşük-t tuzak stratejilerini nasıl tepeye fırlattığını canlı gösterir (öğretici). @pumpkral %78 kazanır ama dipte.

**AK-010 — Haberler arayüzü (web).** `src/lib/newsData.js` + `src/pages/Haberler.jsx` + `haberler.css`. Üç bölüm: Videolu Piyasa (video grid), AI & Finans (AI-özetli makale feed), Teknoloji. İç sekmeler segmented; ana sayfa kartları `#piyasa/#finans/#teknoloji` ile derin-link. Örnek içerik; gerçek besleme + AI özet API sonra.

**AK-009 — Gerçek eğitim içeriği.** `src/lib/lessons.js` (4 gerçek Türkçe ders: piyasa/likidite, mum grafiği, FVG, t-istatistiği) + `src/pages/Ders.jsx` (bölümler, anahtar çıkarımlar, ders-bağlamlı LabEmbed, prev/next) + Ogren derslere bağlandı, `/ders/:slug` route. "t-istatistiği: kendini kandırmamak" dersi platformun felsefesini doğrudan öğretiyor.

Bilgisayara geçince: `npm install && npm run dev` → `localhost:5173/altinkulak/`. Lab, Eğitim (4 ders), Topluluk leaderboard tam işlevsel.

---

## ⏳ SIRADAKİ — Claude Code kurulunca

### AK-004b — Gerçek gecikmeli veri
```json
{ "task_id":"AK-004b","title":"Gercek gecikmeli veri",
  "goal":"data.js'deki sentetik uretimi gercek gecikmeli/EOD kaynakla degistir.",
  "files":[{"path":"src/lib/data.js","action":"edit","role":"getBars gercek API'den ceksin","status":"todo"}],
  "decisions":{"kullanici-basina ucretsiz katman":"gecikmeli/EOD","kaynak":"alt dagitici (Matriks/Foreks) gorusmesi"},
  "do_not_touch":["getBars imzasi: (symbol)->[{t,o,h,l,c}] ; motor degismesin"],
  "acceptance":["BIST sembolu icin gecikmeli OHLC doner","Lab ayni calisir"] }
```

### AK-006 — Auth + davet sistemi (Supabase)
```json
{ "task_id":"AK-006","title":"Auth + davet",
  "files":[{"path":"src/lib/supabase.js","action":"create","role":"client","status":"todo"},
           {"path":"src/pages/Giris.jsx","action":"edit","role":"davet kodu + sosyal giris","status":"todo"}],
  "decisions":{"baslangic":"davet kodlu kapali kayit","tablolar":"users, invites"},
  "do_not_touch":["KVKK/riziko dili (Yasal sayfasi)"],
  "acceptance":["gecerli kod -> kayit","kodsuz -> bekleme listesi"] }
```

### AK-007 — Strateji kaydet & paylaş
```json
{ "task_id":"AK-007","title":"Strateji kaydet/paylas",
  "files":[{"path":"src/lib/strategies.js","action":"create","role":"Supabase CRUD","status":"todo"},
           {"path":"src/pages/Lab.jsx","action":"edit","role":"Kaydet/Paylas butonu","status":"todo"}],
  "decisions":{"paylasim":"sadece OOS t-stat ile birlikte kaydedilir (durustluk korunur)"},
  "acceptance":["strateji kaydedilir","toplulukta t-stat ile gorunur"] }
```

---

## Backlog (sonra handoff)
Topluluk video feed + fork · Leaderboard (edge-ödüllü, AK-007 verisini kullanır) · Haber/AI özet akışı · Contributor rütbe & premium satış (iyzico) · Ben panosu (kayıtlı stratejiler) · gerçek-zamanlı veri · Mobil/PWA cila.

## Motor notları (AK-003 — değiştirmeden önce oku)
- `verdict()`: kârlı edge = t ≥ 2 (POZİTİF) **ve** |t| > rastgele kontrol %95. Negatif t asla "iyi" değil.
- Kontrol grubu = rastgele giriş + AYNI stop/target. Bar-getirisi sampling DEĞİL (o trend'de şişiyordu).
- Lookahead-bias engeli: giriş/sonuç yalnızca i. bardan SONRAKİ barlarla. Bu mantığa dokunma.
- Gerçek SweepLab eşikleri (FVG<0.5 ATR, retest, Kaufman ER) AK-004b sonrası gerçek veriyle kalibre edilecek.

## Tasarım sistemi (buton dili — v2)
Butonlar tek sisteme alındı: düz altın dolgu (parlak degrade + glow KALDIRILDI), tutarlı 10px yarıçap, tek yükseklik. Toggle'lar (Lab sembol/RR, Topluluk sırala) **segmented control**'e çevrildi (`.ak-seg` / `.ak-pill` / `.ak-sortbtns`). signin ghost diline uydu. Yeni buton eklerken: `.ak-btn` + `.ak-btn-primary|secondary|ghost`, toggle için segmented track kullan. Tek tek bordered "pill" buton EKLEME (eski/90'lar hissi).

## Palet (v2 — renk psikolojisi)
Sıcak altın + sakin turkuaz, adaçayı ara-tonuyla. Ortam teal-grafit (`#0E1416`). Turkuaz `#49C5B6` = odak/bilgi/link/sakinlik (uzun oturum); altın `#E6B450` = aksiyon/sinyal/ödül. Yumuşak gradyanlar (body radial, hero teal→gold, panel/strip). Semantik yumuşatıldı: iyi `#4FC9A6` teal-yeşil, kötü `#E08A7A` mercan. Tüm token'lar `:root`'ta; yeni renk eklerken oradan al, sabit hex gömme.

## Piyasa katmanı (çoklu borsa) + okunabilirlik
- `data.js` piyasa gruplarına ayrıldı: **Kripto** (BTC/ETH/SOL) · **BIST** (ASELS/THYAO/GARAN/SISE) · **ABD** (NVDA/AAPL/TSLA/MSFT) · **Avrupa** (ASML/SAP/MC — koşullu) · **Kontrol** (RND). `MARKET_GROUPS` export'u UI'yi besler. `getBars(symbol)` imzası sabit kaldı.
- Lab'a **piyasa grubu seçici** eklendi (segmented); grup değişince sembol listesi değişir. Tümü gerçek motorda doğrulandı (hepsi edge, RND gürültü).
- **AK-004b genişledi:** her grup kendi gerçek kaynağına bağlanacak — Kripto: CCXT/borsa API (kolay, kullanıcı-başına ücretsiz); BIST: gecikmeli alt-dağıtıcı; ABD: gecikmeli/EOD (Polygon/Twelve Data); Avrupa: kaynak bulununca. Sentetik veri yalnızca yer tutucu.
- **Okunabilirlik:** kart/ders index numaraları **turkuaz-soft `#7FD8CD`**; kart BAŞLIKLARI fona karışmasın diye `var(--txt)` (açık) sabitlendi.

## Lab v2 + Ben log + cihaz kapsamı
- **Lab (masaüstü) yenilendi:** Sembol artık sabit liste değil → **arama + akıllı tamamlama** (`ALL_SYMBOLS`, ~1.5sn debounce, smart find). **R:R serbest giriş**. **"Kendi sistemin (gelişmiş)"** açılır paneli (FVG boşluk eşiği ×ATR → motora bağlı; ileride tam kural editörü). Üstte "tam kurulum masaüstünde" notu.
- **Ben:** gerçek **işlem & test geçmişi logu** (tarih/sembol/setup/yön/R/t-stat) + özet kartlar. Masaüstü tam, telefon özet.
- **Cihaz kapsamı ilkesi** (CLAUDE.md §5b): telefon = izleme/hızlı; masaüstü = tam kurulum. TradingView gibi.
- **Renk fix:** marka "altın" + tüm sayfa başlıkları koyu render ediliyordu → `var(--txt)` açıkça atandı (CLAUDE.md §5 kuralı).

## Logo + Marka kimliği
- **Logo seçildi: "Keskin Kulak"** (soyut fasetli kulak — işitme + kesinlik). `src/components/AkLogo.jsx` (yeniden kullanılabilir, useId ile çakışmasız gradient). Navbar ve footer'a bağlandı; eski Activity ikonu kaldırıldı.
- **favicon/app ikonu:** `public/favicon.svg` (yuvarlatılmış kare, koyu zemin + altın mark). `index.html`'e link + theme-color.
- **Marka kimliği belgesi:** `BRAND.md` — anlam, logo kullanımı/yanlış kullanım, renk rolleri, tipografi, ses & ton, tagline. Görsel kimlik sayfası ayrıca üretildi.
- Debounce 1.5s → **300ms** (standart). Wordmark **tek renk** (açık); altını logo taşıyor.

## Tasarımı kilitlenen büyük bloklar (önizlemeler hazır → Claude Code)

### AK-011 — Mum grafiği motoru ✅ (client-side gerçeklendi)
`src/components/Chart.jsx` + `src/lib/detectors.js`. Gerçek candlestick (son 120 bar pencere), EMA 20, fiyat ekseni. Lab'a tam genişlik entegre. Veri `getBars` (AK-004b ile gerçek feed'e geçer). Kalan: timeframe/aralık (AK-013), trade marker'ları (motor trade index'i dönmeli).

### AK-012 — Kavram dedektörleri + "taktiği test et" ✅ (AK-012b tamam)
Dedektörler GERÇEK: `detectors.js` → findFVG (net), findOrderBlocks + findBOS (heuristik). Lab kavram filtresi (FVG/OB/BOS) grafiğe otomatik oturuyor; Mitigation/Order Flow/Fibonacci çip var, dedektörü sonra. KALAN: seçili kombinasyonu backtest motoruna bağlayıp "taktiği test et" + SL/TP çizimi + "fazla filtre edge'i yer" göstergesi. Önizleme: Onizleme_Grafik_Pro.jsx.

### AK-013 — Timeline scrubber + katman şeritleri ✅
`src/components/Timeline.jsx`. Çift perde kolu (pointer drag → pencere), ortadan pan, ay etiketleri, tüm-seri sparkline. Chart `range={start,end}` prop'u alıp o pencereyi çiziyor (overlay/trade'ler pencereye filtreli). Katman şeritleri (Likidite/Hacim/FVG yoğunluğu) açılır-kapanır, pencereye göre. Lab'da `win` state + 'Katmanlar' anahtarı. Doğrulandı: pencere sınırları + içi FVG sayımı düzgün.

### AK-014 — Mesajlaşma + ekran görüntüsü
Messenger usulü alt balon/bar, mesajda yanıp sönme, mic durumu. Composer'da ekran-görüntüsü → kırp → gönder. KAPSAM/OPTİMİZASYON: yakalama client-side (html2canvas / Region Capture) → sunucu çökmez; görsel WebP+boyut limiti, gönderimde cooldown (~2sn), realtime Supabase Realtime, depolama Supabase Storage. Marka: paylaşılan strateji t-stat ile; canlı seans "eğitim/simülasyon" etiketli (SPK). Önizleme: Onizleme_Mesaj.jsx + Onizleme_Sohbet.jsx.

### Hâlâ stub (hızlı, dış-bağımlılıksız — gerçek projede bitirilebilir)
Profil (/u/:handle) · Fiyatlandırma · Giriş (arayüz) · Contributor (iskele).

## AK-012b ✅ (taktiği test et + SL/TP grafikte)
- `backtest.js`: `simulate` artık trade nesnesi döndürüyor `{entryIdx,dir,entry,stop,target,outcome}`. `runBacktest(bars,{rr,maxGapATR,concepts})` — kavramları AND'liyor (`filterGaps`: OB→bölgeye yakınlık, BOS→trend hizası), OOS'a da uyguluyor; sonuç `trades[]` içeriyor.
- `detectors.js`: `isNearOB`, `trendArr` yardımcıları.
- `Chart.jsx`: `trades` prop → giriş üçgenleri (win yeşil/loss mercan) + son trade'in SL (kırmızı) / TP (yeşil) çizgileri.
- `Lab.jsx`: `run()` concepts'i geçiyor, Chart'a `trades={res?.trades}`.
- DOĞRULANDI: FVG t=3.4✓ → +OB 70→9 işlem t=2.0✗ (edge seyreldi, marka tezi); +BOS t=5.9✓. Trade alanları tam, görünümde 11 trade. **t-stat'a sahte ayar YOK.**
- Kalan: AK-013 timeline, AK-012c (Mitigation/Order Flow/Fibonacci dedektörleri).

## AK-012c ✅ (Mitigation / Order Flow / Fibonacci)
- `detectors.js`: `findMitigation` (OB'ye geri dönüş), `orderFlowArr` (son k mum gövde baskısı yönü), `findFib` (pencere salınımı + 0.5/0.618/0.705/0.786 + indirim/primli bölge), `fibSideOk`.
- `Chart.jsx`: mit → eşkenar dörtgen işaret; of → alt kenarda yön şeridi (yeşil/mercan); fib → seviye çizgileri + indirim/primli bölge gölgesi.
- `backtest.js` filterGaps: mit (mitige OB'ye yakınlık), of (yön hizası), fib (indirim/primli taraf) — hepsi AND, OOS'a da.
- DOĞRULANDI: +mit 70→7 t2.1✗, +of 62 t2.9✓, +fib 21 t**-0.3**✗ (fib bu veride edge'i bozuyor — dürüst), hepsi birden → 0 işlem (aşırı filtre). Sahte ayar yok.
- Grafik dünyası TAM: AK-011 ✅ AK-012(abc) ✅ AK-013 ✅. Kalan: AK-014 (mesajlaşma, backend), stub sayfalar (Profil/Fiyatlandırma).

## Rakip analizi + eksik standartlar + özgün eklemeler (AK-015)
Bakılan muadiller: TradeZella, Edgewonk, Tradervue, TradesViz, TradingView.

**Eklendi (bu tur):**
- **Beklenen değer (expectancy) + Profit Factor** — her backtest sonucunda. Standart metrik, bizde yoktu. (`backtest.js` + Lab metrik kartları)
- **İleri/Monte Carlo simülasyonu** — işlem sonuçlarını 1000× bootstrap; medyan, kötü %5 senaryo, en kötü drawdown, zararla biten %. Edgewonk'un "performance simulator"ının dürüstlük versiyonu: tek equity curve'e güvenme. (`monteCarlo()` + Lab MC paneli)
- **Edge Tarayıcı (`/tarama`)** — ÖZGÜN: seçili taktiği TÜM sembollerde test edip t-stat'a göre sıralar. "Şu an hangi piyasada gerçek edge var" — tahmin değil ölçüm. Rakiplerde "performance by symbol" var ama canlı edge taraması yok. (route + navbar + sayfa)

**Standart ama HENÜZ eksik (backlog):**
- Pozisyon/risk hesaplayıcı (giriş/stop/hesap %'sinden lot) — kolay, client-side.
- Planlanan vs gerçekleşen R:R + psikoloji etiketleri (FOMO/intikam/erken çıkış) — Edgewonk imzası, markaya uygun (disiplin). Ben/journal'a eklenir.
- Trade replay (bar-bar oynatma) — Chart + Timeline ile client-side kurulabilir; eğitim modu.
- Watchlist + fiyat alarmları — watchlist local; alarm backend (Claude Code).
- Ekonomik takvim — veri kaynağı gerektirir.
- Strateji playbook/şablonları (kayıtlı taktikler, kuralla/kuralsız kazanç) — AK-007 ile birleşir.

## AK-016 ✅ (Trade Replay + Pozisyon/Risk hesaplayıcı)
- **Trade Replay** (özgün/eğitim): Lab grafiğinde "Replay" anahtarı → bar-bar oynatma. İmleç pencere içinde ilerledikçe mumlar + kavram katmanları (FVG vs.) oluştukça açılır. Kontroller: ◀ ▶ adım, oynat/duraklat, 1x/2x/4x hız, sıfırla, ilerleme çubuğu. Chart `range.end`'i imleçle sürülüyor. (Lab + chart.css)
- **Pozisyon & risk hesaplayıcı** (standart): strateji panelinde açılır kart. Hesap $/risk %/giriş/stop → pozisyon adedi + riske atılan (1R) + pozisyon değeri. Backtest sonrası beklenen değerle teorik işlem-başı beklenti de gösteriliyor. "Geçmiş ≠ gelecek" uyarısıyla.
- Kalan backlog: planlanan-vs-gerçekleşen R:R + psikoloji etiketleri, watchlist+alarm (backend), ekonomik takvim, playbook.

## AK-018 ✅ (Profil+Portföy, Fiyatlandırma, Giriş, Disiplin/Psikoloji, İzleme)
- **Profil** (`/u/:handle`): rütbe + doğrulanmış edge metrikleri + paylaşılan stratejiler (t-stat'lı) + **kendi yönetebileceği hisse/kripto PORTFÖY** (sembol/tür/adet/maliyet → değer + K/Z, localStorage `ak_portfolio_v1`). Güncel fiyat veri setinden; canlı feed sonra. Leaderboard @isimleri → profile linkli.
- **Fiyatlandırma** (`/fiyatlandirma`): Ücretsiz / Pro / Katkıcı. Gecikmeli veri = ücretsiz katman avantajı; gerçek-zamanlı + AI = Pro. Eğitim/SPK uyarısı. Navbar'a eklendi.
- **Giriş** (`/giris`): davet kodu / bekleme listesi arayüzü (backend AK-006).
- **Ben — Disiplin + Psikoloji**: planlanan vs gerçekleşen R:R, plana uyum %, psikoloji etiketleri (Plana uydu/Erken çıkış/FOMO). "Sorun seçimde değil yürütmede" içgörüsü (Edgewonk imzası, kendini-kandırma temamız).
- **İzleme** (`/izleme`): watchlist — sembol + son fiyat + mini grafik + "şu an edge var mı" rozeti (canlı runBacktest), localStorage `ak_watch_v1`. Navbar'a eklendi.

## DURUM ÖZETİ (Cuma öncesi)
**Gerçek & çalışan (npm run dev):** Ana, Lab (grafik+6 dedektör+taktik testi+SL/TP+Monte Carlo+expectancy/PF+Replay+risk hesaplayıcı), Timeline+katmanlar, Tarama (edge tarayıcı), İzleme (watchlist), Eğitim+ders, Topluluk, Haberler, Ben (disiplin+psikoloji), Profil+portföy, Fiyatlandırma, Giriş, logo+marka kimliği. Build temiz.
**Kalan (çoğu backend / Claude Code):** AK-004b gerçek veri feed'leri · AK-006 auth+davet (Giriş UI hazır) · AK-007 strateji kaydet/playbook (localStorage'a alınabilir) · AK-014 mesajlaşma+ss · AK-017 AI (proxy+cache) · Contributor sayfası · ekonomik takvim · Meltem/Mesaj UI'larının gerçeklenmesi.

---

# OTURUM: MOTOR SERTLEŞTİRME + GERÇEK VERİ + SİCİL/RÜTBE (4 Tem 2026) — CANLIDA ✅

Site yayında: **https://samiboran.github.io/altinkulak/** (gh-pages + .nojekyll)

## AK-M01 ✅ Motor test ağı
- `tests/motor.test.js` — **42 test**, bağımlılıksız (saf node), `npm test`.
- Dürüstlük garantileri testli: RND asla edge vermez · negatif t asla "iyi" değil · lookahead-bias engeli · determinizm · sicilde silme fonksiyonu YOK · 2R tavanı · spam filtresi.
- KURAL: motora/sicile/rütbeye dokunan HER değişiklikten sonra `npm test`. Kırmızı test = değişiklik geri alınır veya test bilinçli güncellenir (sebep bu log'a yazılır).

## AK-M02 ✅ İşlem maliyeti (costR)
- `runBacktest(..., { costR })`: işlem başına gidiş-dönüş maliyet, R cinsinden. Kazanç `rr−costR`, kayıp `−1−costR`.
- **Rastgele kontrol grubu da aynı maliyeti öder** (adil kıyas — kritik).
- Lab gelişmiş panelde giriş, varsayılan **0.05R**. Tarama sabit 0.05R ile tarar (notu tabloda).

## AK-M03 ✅ Çoklu-test dürüstlüğü (Bonferroni)
- `stats.js`: `bonferroniT(N)` (15 test → eşik t≥2.7), `expectedFalsePositives(N)` (~0.8).
- Tarama: her sonuçta altın uyarı kutusu + **Sıkı mod** anahtarı (aynı sonuçlar 2.7 eşiğiyle yeniden yargılanır) + kaç sembolün geçtiği.

## AK-004b FAZ 1 ✅ GERÇEK KRİPTO VERİSİ
- `data.js`: `loadReal(sym)` — **Binance public klines** (key YOK, proxy YOK, CORS açık). BTC/ETH/SOL, 4H, 900 bar. 1 saat localStorage önbelleği (`ak_bars_v1_*`). Birincil `data-api.binance.vision`, yedek `api.binance.com`; hepsi düşerse sessiz sentetik fallback.
- `getBars` imzası DEĞİŞMEDİ (motor/Chart/Timeline habersiz). `t`=indeks korunur, gerçek zaman `time` alanında.
- UI kaynak işaretleri: Lab rozeti ("● GERÇEK VERİ · Binance 4H" / "○ örnek veri"), Tarama+İzleme satırlarında ●/○, Portföy'de BTC/ETH/SOL fiyatı gerçek.
- SPK sigortası: Tarama/İzleme dili geçmişe kilitlendi ("son 900 barda... gelecek vaadi değildir").
- ⚠️ DOĞRULANACAK: canlıda BTC/ETH/SOL ● yeşil yanıyor mu? (kullanıcı tarayıcısından Binance erişimi)
- FAZ 2 (bekliyor): BIST/ABD/Avrupa — lisanslı kaynak + Worker proxy gerekir. RND daima sentetik (kontrol).

## AK-020 ✅ Sicil + AK-020b ✅ Sandbox ("demonun demosu")
- `ledger.js`: append-only defter (`ak_ledger_v1`). **Silme/düzenleme fonksiyonu bilerek YOK — test garanti ediyor.**
- Ben: hardcoded LOG kaldırıldı → gerçek sicil. Form (sembol/setup/yön/plan R:R/sonuç R/psikoloji etiketi) → kalıcılık onay modalı ("Sicil, kendine karşı dürüstlüğündür") → yazılır. Kartlar+disiplin paneli gerçek veriden (3+ işlemde görünür).
- `sandbox.js` AYRI modül (`ak_sandbox_v1`): silme serbest, aynı doğrulama, HİÇBİR istatistiğe/rütbeye sayılmaz. Ben'de Sicil|Sandbox segmented; sandbox turkuaz tema + çöp kutusu + onaysız ekleme.

## AK-019 ✅ Rütbe motoru + Ben rütbe kartı
- `ranks.js`: **Edge Rütbesi** Aday(n<30) → Çırak → Kalfa(+10R) → Usta(60i,+30R) → Büyükusta(100i,+60R,**t≥2**).
- Anti-gaming (hepsi testli): işlem başına sayılan ±2R tavan · aynı sembolde 5dk spam→ilki sayılır · sıfır varyans t=0 (Büyükusta olamaz) · hesap kavramı yok, sicil silinmez → rütbe geri alınamaz.
- **Katkı Rütbesi** motoru hazır: Gözlemci→Katkıcı(10)→Eğitimci(40)→Öğretmen(100)→Profesör(250); veri kaynağı AK-023'te.
- Ben'de altın rütbe kartı: ad + bağlam (n · toplam R · t) + "Sıradaki: X — eksikler". Yalnız sicil sayılır.

## Üye kartı ✅ (Topluluk)
- @kullanıcıya tıkla → modal: #kaçıncı üye · Edge+Katkı rozetleri · meslek (açıksa) · n işlem+%isabet+toplam R (üçü DAİMA birlikte — yalın isabet tuzak) · piyasa odağı DAVRANIŞTAN ("Kripto ağırlıklı %71 · ABD %22...") · n<30'da "örnek az" uyarısı · "Profili gör" linki.
- Veri: `communityData.js` MEMBERS (demo; AK-006 sonrası gerçek).

## Portföy ek ✅
- Serbest sembol + manuel güncel fiyat (listede olmayan/manuel satırda inline fiyat girişi, K/Z anlık). Öncelik: manuel > veri seti > maliyet.

## Deploy notları (bir daha yaşanmasın)
- `package.json` deploy: `gh-pages -d dist --dotfiles` (--dotfiles ŞART).
- `public/.nojekyll` ŞART — yoksa GitHub Pages Jekyll'e sokup "deploy failed" verir.
- Sıra: `npm run build` → `npm run deploy` → kod için ayrıca `git push origin main --force`.
- Repo: github.com/samiboran/altinkulak (4 Tem 2026'da oluşturuldu).

## GÜNCEL DURUM ÖZETİ
**Canlı & gerçek:** tüm sayfalar + 42 testli motor + gerçek kripto verisi (doğrulama bekliyor) + Sicil/Sandbox/Rütbe + üye kartı.
**Backend hâlâ YOK (bilinçli):** her şey localStorage — tek cihaz, üyelik yok. Sıradaki büyük blok bu.

## KALAN İŞLER — öncelik sırasıyla
1. **DOĞRULAMA:** canlıda kripto ● kontrolü + gerçek BTC/ETH/SOL t-stat'larının okunması (platformun ilk gerçek cümlesi).
2. **AK-006 Supabase auth + davet kodu** (Giriş UI hazır) → ardından sicil/portföy/sandbox'ın Supabase'e göçü (localStorage→DB, cihazlar arası senkron). Claude Code işi.
3. **AK-022 Layout + hız**: panel sistemi, "Temel" reset, route lazy-load, girişsiz fiyat bakışı <1sn (TradingView hızlı-bakış trafiği hedefi).
4. **AK-021 Fikirler feed'i**: pozisyon bağlı/etiketli fikirler, otomatik skor — CANLIYA ÇIKMADAN ÖNCE SPK bakışı şart.
5. **AK-023 Davet ekonomisi + X** (kimlik+embed; takipçi sayısı hiçbir hesaba girmez) — AK-006'ya bağımlı.
6. **Replay tahmin modu**: duraklat→kullanıcı giriş/SL/TP işaretler→skor. Ucuz, marka-uyumlu, rütbeyle birleşebilir.
7. **CSV işlem import'u** (journal'ın gerçek değeri) · çok-timeframe · AK-017 AI proxy · AK-014 mesajlaşma · ekonomik takvim · AK-024 İngilizce (backlog) · AK-004b Faz 2.

## AK-022 ✅ Layout + hız
- `layout.js`: panel görünürlüğü (`ak_layout_v1`, kalıcı). Varsayılan **Temel**: grafik+sembol+R:R+sonuç; Zaman çizelgesi / Monte Carlo / Risk hesaplayıcı / Gelişmiş kapalı.
- Lab'da **Görünüm** menüsü (checkbox'lar) + **"Temel (varsayılana dön)"** tek tık reset. Eski adv/risk açılırları da aynı layout state'ine bağlandı (çift kontrol yok).
- **Route lazy-load** (App.jsx): yalnız Home + kabuk peşin; sayfalar kendi parçasında. Ana paket 273KB → **182KB** (gzip 60KB). Hızlı-bakış hedefine büyük adım.

## Replay TAHMİN MODU ✅ (pratik)
- Replay açıkken şerit: **Long / Short** — giriş=o anki kapanış, SL=1×ATR14, TP=2×ATR (sabit 1:2). Tahmin verilince replay akar; bar SL/TP'ye değince çözülür (stop-önce, motorla aynı tutucu varsayım). Skor: "N tahmin · M isabet · ±XR".
- Bilinçli sınırlar: sicile SAYILMAZ (etikette yazıyor), oturumluk skor (kalıcı değil — rütbeyle birleşimi ileride, AK-019 kapsamında düşünülür), pencere biterse "sayılmadı".

## AK-006 HANDOFF ✅ (doküman — kod değil)
- `AK-006-handoff.md`: Sami'nin 10dk'lık Supabase kurulum adımları + tam SQL şema (profiles/invites/ledger/sandbox/portfolio) + RLS politikaları (**ledger'da update/delete politikası bilerek yok — silinemezlik artık DB seviyesinde de**) + use_invite RPC + AK-006a/b görev JSON'ları + env kuralları (.env git'e girmez; anon key görünür=normal, güvenlik RLS'te).
- AK-021 Fikirler BİLİNÇLİ ertelendi: auth'suz tek kişilik feed anlamsız + canlı öncesi SPK bakışı şartı.

## AK-025 ✅ CSV işlem import'u
- `csv.js`: bağımlılıksız çözücü — başlık zorunlu (`sym,dir,plan,r` + ops. `tag,setup,d`), sütun sırası serbest, `,` veya `;`, yön esnek (long/l/al/buy...). Hatalı satır atlanır+raporlanır. `dedupeKey` (sembol+R+gün+yön) ile mükerrer koruması: hem dosya içi hem mevcut kayıtlara karşı.
- Ben'de "CSV içe aktar" → önizleme modalı (geçerli/mükerrer/hatalı sayıları + ilk 5 satır) → hedef seçimi: **Sandbox'a al** (güvenli varsayılan) veya **Sicile işle (kalıcı)** açık uyarıyla. Toplu kalıcı yazım kazasına karşı tasarım.
- 5 test eklendi. Bilinçli sınır: tırnaklı/virgüllü alan yok (işlem verisinde gerekmez).

## AK-026 ✅ Kompakt grafik (TradingView hissi)
- **Chart.jsx:** crosshair (dikey+yatay kesikli çizgi, sağ eksende imleç fiyat balonu) · **OHLC künyesi** sol üstte tek satır (O/Y/D/K + % değişim; imleç bardaysa o bar, değilse son bar; yöne göre yeşil/kırmızı) · **son fiyat balonu** sağ eksende (yeşil/kırmızı).
- **Lab üst barı kompaktlaştı:** kavram çipleri + EMA + katman anahtarı artık açıkta değil — "Göstergeler (n) ▾" menüsünde (Görünüm paterni). Üst bar: Göstergeler · Replay · Görünüm · veri rozeti.
- **Hızlı aralık butonları** grafik altında: 14G / 1A / 3A / Tümü (900×4H ≈ 150 gün ölçeğinde pencere ayarlar; Timeline'a gerek kalmadan).

---

# İÇERİK STRATEJİSİ (X) — karar kaydı

## Karar
- **Bot/otomatik feed YOK.** "Gürültüyü değil, sinyali duy" markası günde 10-20 otomatik paylaşımla çelişir. AI taslakta kullanılır, yayında insan (Sami) vardır.
- **Kişilerin canlı işlemlerine yorum YOK** — SPK yönlendirici-yorum riski + davetsiz reply spam algısı. Kişi değil İDDİA test edilir; dil daima geçmiş çerçeveli.
- Hesap Altınkulak'ın hunisidir; "bağlamadan yönlendirme" diye bir şey yok, standardı taşır.
- Genel AI/teknoloji haber markası: MVP sonrası AYRI hesap olarak yeniden değerlendirilir (backlog).

## Format: FALSİFİKASYON İÇERİĞİ (setup'a değil YÖNTEME bağlı)
Kimlik FVG değil, test. Konu havuzu dönüşümlü: SMC setup'ları · klasik indikatör ezberleri (RSI 30/70, golden cross, MACD kesişimi) · takvim söylentileri (pazartesi gap'i, "sell in May") · piyasa ezberleri ("altın enflasyonda", "halving pump'ı") · X'te viral herhangi bir "kesin çalışıyor" iddiası.

Şablon (5 adım): 1) İDDİA — bu hafta dolaşan söylenti/setup, kaynaksız-isimsiz özet. 2) KURAL — iddiayı test edilebilir kurala çevir (bu adımın kendisi eğitimdir: "test edilemeyen iddia, iddia değildir"). 3) TEST — 900 bar, OOS, 0.05R maliyet, rastgele kontrol; ekran görüntüsü. 4) SONUÇ — t-stat + tek cümle yorum; "edge yok" da eşit değerde içeriktir. 5) KAPI — "Aynı testi kendin yap: [site]. Geçmiş ölçümdür, tavsiye değildir."

## İlk 5 paylaşım adayı
1. "RSI 30'da al 70'te sat" — BTC 4H'ta gerçekten kazandırıyor mu?
2. Bu hafta viral olan bir SMC setup'ı (o hafta ne dolaşıyorsa).
3. "Golden cross geldi, boğa başladı" — EMA50/200 kesişimi testte.
4. "Kripto pazartesi düşer" takvim söylentisi.
5. Kendi Mod B'mizin dürüst raporu — kazandığımız VE kaybettiğimiz dönemlerle ("kendimizi de test ediyoruz" güveni).

Ritim: haftada 2-3, otomatiksiz. Ölçüt: takipçi değil, siteye gelen davet-istekli kullanıcı.

## AK-027 ✅ Fiyat okunurluğu (gerçek-veri sonrası)
- Akıllı fiyat formatı `fmtP`: ≥10.000 → 104,230 · ≥1.000 → 0 ondalık · ≥100 → 1 · ≥1 → 2 · <1 → 4. Eksen/crosshair/son-fiyat/künye hepsinde. Sağ eksen genişliği etikete göre otomatik (BTC 6-hane sığar).
- Grid 5→6 çizgi. Aralık şeridine − / + yakınlaştırma (sağ uç sabit, min ~36 bar).
- 🏛️ TARİHE NOT — İLK GERÇEK ÖLÇÜM (6 Tem 2026, FVG 1:3, 0.05R maliyet, Binance 4H): BTC t=−0.5 EDGE YOK · SOL t=1.9 eşik altı · ETH t=2.5 sınırda (Sıkı mod eler) · RND t=0.3 ✓. Sentetik gömülü edge'ler kurguydu; gerçek piyasa çıplak FVG'yi reddetti — SweepLab bulgusuyla tutarlı (edge filtreyle var). İlk falsifikasyon içeriğinin malzemesi.

## AK-028 ✅ Stop genişliği parametresi (kullanıcı hipotezi → test edilebilir)
- Çıkış noktası: Sami'nin "SL çok sıkı, geniş olsa az stoplanırız" hissi. Cevap tartışma değil PARAMETRE: gelişmiş panelde "Stop genişliği (×ATR)" (0.5–3, varsayılan 1 = eski davranış birebir).
- R tanımı korunur (risk = stopMult×ATR; kayıp −1R, hedef rr·R) → geniş stop = az stoplanma AMA daha uzak TP; net etkiyi t-stat söyler. **Kontrol grubu da aynı stopMult'u kullanır** (costR'deki adil-kıyas ilkesi). +3 test (50 oldu). Ayrıca not: risk hesaplayıcıdaki %1 stop mesafesi değil POZİSYON BOYUTU — kullanıcı karışıklığı görüldü, ileride araca açıklama satırı eklenebilir.

## AK-028b ✅ Grafik etkileşimleri (standart beklentiler)
- **Tekerlek zoom** — imlecin durduğu bara odaklı (native wheel listener, passive:false; React onWheel preventDefault edemez, bilinen tuzak). Min 20 bar.
- **Alan-seç zoom** — basılı tut + sürükle → kesikli turkuaz seçim kutusu → bırakınca o aralığa zoom. **Çift tık** = tüm seri.
- Hepsi Lab'ın `win` state'i üzerinden — Timeline/aralık butonlarıyla uyumlu.

## AK-029 📋 KARAR: Lightweight Charts göçü (yapılmadı — planlandı)
- Doğru uzun-vade: TradingView'un açık kaynak **lightweight-charts** kütüphanesi (eksen sürükleme, kinetik pan, dokunmatik dahil her standart etkileşim hazır).
- NEDEN ŞİMDİ DEĞİL: grafiğimizin değeri 8 özel katmanda (FVG/OB/BOS/Fib+OTE/OF şeridi/işlem işaretleri/SL-TP/mitigation) — göç bunların kütüphane primitive'leriyle yeniden yazımı demek. Kör oturumda değil, Sami'nin gözü önünde adım adım (önce çıplak mum+katman-katman taşıma) yapılacak. O güne dek SVG grafik + AK-028b etkileşimleri yeterli.
- Dikey eksen sürükleyerek sıkıştırma/açma da bu göçün kapsamında.

## AK-030 ✅ Grafik standart taban paketi ("TV'den gelen kullanıcıya eksik verme" ilkesi)
Sami kararı: kullanıcılar TradingView'dan geliyor, taban çizgisinin altı kabul edilemez. Eklenenler:
- **Pan (sürükle-kaydır)** artık varsayılan sürükleme — TV standardı. Alan-seç zoom **Shift+sürükle**'ye taşındı. Çift tık = tümü.
- **Dikey eksen ölçeği**: sağ fiyat ekseni üzerinde yukarı/aşağı sürükle → fiyat aralığı açılır/sıkışır (vScale 0.2–6); eksene çift tık = oto-sığdır. Sembol değişince sıfırlanır.
- **Zaman ekseni etiketleri** (altta 5 tarih; gerçek veride "06 Tem", sentetikte bar no) — daha önce HİÇ yoktu.
- **Crosshair tarih balonu** alt eksende (fiyat balonunun zaman ikizi).
- **Hacim çubukları**: parseKlines artık v alanını taşıyor (test güncellendi); gerçek Binance verisinde alt bantta yarı saydam yeşil/kırmızı. Sentetikte gizli. NOT: localStorage bar önbelleği 1 saat TTL'li — eski önbellekte v yok, hacim ilk yenilemede görünür.
- **Son fiyat çizgisi** (kesikli, yöne göre renkli) balona ek.
- **Log ölçek** anahtarı aralık şeridinde ("Log").
Bilinçli dışarıda: çizim araçları, alarm, kinetik/dokunmatik pan → AK-029 (lightweight-charts göçü) kapsamı.
