# CLAUDE.md — Altınkulak

> Bu dosya projenin kök kurallarıdır. Her oturumda önce bunu oku.
> Karar/tasarım/plan başka bir Claude oturumunda (sohbet tarafı) olgunlaştırılır; buraya **devir (handoff)** olarak gelir. Sen (Claude Code) mekanik uygulamayı yaparsın.

---

## 1. Proje Kimliği
- **Ne:** Türkçe, AI destekli, istatistik temelli trading **eğitim + simülasyon** platformu.
- **Slogan:** Gürültüyü değil, sinyali duy.
- **Konumlandırma (zorunlu dil):** Eğitim ve simülasyon. **Yatırım danışmanlığı / sinyal servisi DEĞİL.** "AL/SAT sinyali" ve gerçek-para getiri iddiası kurma; performans yalnızca kâğıt-para / geçmiş simülasyon / doğrulanmış çerçevede.

## 2. Stack
- React + Vite + react-router-dom
- Supabase (sonra: auth, storage, db) — başta bağlı değil
- Dağıtım: GitHub Pages (gh-pages)
- Hedef yol: `samiboran.github.io/altinkulak`, yerel: `C:\Users\pc\Desktop\altinkulak`

## 3. DOKUNULMAZ Config (asla silme/değiştirme)
- `BrowserRouter basename="/altinkulak"`
- `vite.config.js` → `base: '/altinkulak/'`
Bu iki satır olmadan Pages'te beyaz ekran gelir. Bir görev bunları değiştirmeni gerektiriyorsa, DUR ve sor.

## 4. Klasör Düzeni (hedef)
```
src/
  main.jsx              # Router kökü
  App.jsx               # Route tanımları
  pages/                # Home.jsx, Lab.jsx, Ogren.jsx, Topluluk.jsx ...
  components/           # Navbar, HeroScope, FeaturedTabs, CardGrid, Footer ...
  lib/                  # veri/yardımcılar (homeData.js, supabase.js ...)
  styles/               # global.css, home.css ...
```

## 5. Tasarım Token'ları (sabit)
- **Tema:** koyu. Pure black DEĞİL.
- **Palet (v2 — sıcak altın + sakin turkuaz, yumuşak geçişler):**
  - zemin `#0E1416` (teal-grafit) · panel `#16201F` · yüzey `#1B2826` · çizgi `#25322F`
  - **altın** `#E6B450` / parlak `#F1C97A` → aksiyon, sinyal, ödül (sıcak vurgu)
  - **turkuaz** `#49C5B6` / soft `#7FD8CD` / derin `#2E9488` → odak, bilgi, link, sakinlik
  - **adaçayı** `#8FB6A8` → altın↔turkuaz köprü ara-ton
  - metin `#E8EEEC` · sönük `#8DA39E` (teal-grimsi)
  - semantik: iyi/edge `#4FC9A6` (teal-yeşil) · kötü `#E08A7A` (mercan) — ikisi de yumuşak
- **Renk psikolojisi:** turkuaz sakinlik/güven/odak (uzun oturum), altın ödül/sinyal. Düşük kontrast, yumuşak gradyanlar — göz yormaz.
- **Yazı tipleri:** Başlık **Chakra Petch** · gövde **Inter** · veri/sayı **JetBrains Mono**
- **Logo:** "Keskin Kulak" — `src/components/AkLogo.jsx` (soyut fasetli kulak, altın gradyan). favicon `public/favicon.svg`. Detaylı kimlik: `BRAND.md`.
- **İmza öğe:** osiloskop hero — solda soğuk gürültü (teal), sağda sıcak sinyal (altın), yumuşak geçiş.
- **Kural:** ortam teal-grafit; teal=sakin/bilgi, altın=aksiyon/sinyal. Neon/sert renk yok.
- **Metin rengi:** her başlık/marka yazısına AÇIK renk (`var(--txt)`) açıkça ata; gövde rengi inheritance'a güvenme (bazı cihazlar renksiz metni koyu render ediyor).

## 5b. Cihaz kapsamı (ÖNEMLİ — TradingView mantığı)
Masaüstü ve telefon AYNI değil. Telefon her şeyi yapmaz.
- **Masaüstü:** tam strateji kurulumu, sembol arama + akıllı tamamlama, serbest R:R, "kendi sistemin" gelişmiş parametreler/kural editörü, derin analiz.
- **Telefon:** izleme/takip ağırlıklı — piyasa, haber, eğitim, leaderboard, kişisel log (özet), hızlı test. Ağır kurulum yok; "Gelişmiş masaüstünde" notu gösterilir.
- Veri/log senkron: aynı hesap, ama telefon görünümü sadeleştirilmiş/okuma ağırlıklı.
- Yeni özellik eklerken sor: bu masaüstü-only mu, telefonda da mı? Varsayılan: ağır kurulum masaüstü.

## 6. Çalışma Tercihleri (Sami)
- Türkçe konuş.
- **Tek adım ver, sıradakini bekle.** Aynı anda 5 şey yaptırma.
- Terminal komutları **tek satır**, PowerShell (Windows + VS Code).
- Dosya değişikliğinde **tam dosya** ver (partial diff değil) — başlangıç seviyesi.
- Bir şeyi silmeden/üzerine yazmadan önce neden olduğunu bir cümleyle söyle.

## 7. Deploy
- `npm run deploy`
- sonra: `git add . && git commit -m "..." && git push origin master:main --force`
(Bu komutları her görev bitiminde değil, Sami "deploy" deyince çalıştır.)

## 8. Devir (Handoff) Protokolü — bu projenin çalışma şekli
Sohbet tarafı sana her görevi şu iki parçayla yollar:
1. **JSON blok** (`handoff`): makine-okunur sözleşme — task_id, dosyalar, kararlar, dokunulmazlar, CC'ye kalan TODO'lar, kabul kriterleri, komutlar.
2. **Mapping/Briefing**: numaralı, insan-okunur adımlar — ne yapıldı, sıradaki ne.

Senin işin: JSON'daki `files` + `todo_for_cc`'yi uygula, `decisions` ve `do_not_touch`'a uy, `acceptance` maddelerini sağla. Uzun kodu sen yazarsın; iskelet ve kararlar sohbet tarafından gelir. Bittiğinde kısa bir "tamamlandı" özeti + varsa sapmaları bildir.

### handoff JSON şeması
```json
{
  "task_id": "AK-000",
  "title": "",
  "goal": "",
  "files": [{ "path": "", "action": "create|edit|delete", "role": "", "status": "skeleton|todo|done" }],
  "decisions": {},
  "do_not_touch": [],
  "todo_for_cc": [],
  "acceptance": [],
  "commands": []
}
```
