# Altınkulak

Türkçe, istatistik temelli trading **eğitim + simülasyon** platformu.
Sinyal servisi DEĞİLDİR — gerçek para/kaldıraç yoktur. Slogan: *Gürültüyü değil, sinyali duy.*

Canlı: https://samiboran.github.io/altinkulak/

## İlkeler (kısa)
- **İstatistik yalan söylemez:** rütbeler kazanç oranından değil, sınırlandırılmış R + OOS t-istatistiğinden gelir.
- **Fabrike veri yasak (D6):** veri yoksa dürüst boş durum gösterilir.
- **Event sourcing (D9):** tüm durumlar olay log'undan türetilir.
- **Hipotez kapısı (D19):** elle seçilmiş bölgeden çıkan kural, OOS t≥2 geçmeden "strateji" sayılmaz.
- Tüm görev/karar kaydı: `docs/AK_MASTER_REGISTRY.json` (tek gerçek kaynak).

## Kurulum
```
npm install
cp .env.example .env   # Supabase URL + anon key doldur (Dashboard → Settings → API)
npm run dev            # http://localhost:5173/altinkulak/
```

## Test & Deploy
```
npm test               # motor + sayfa render testleri (290+, hepsi yeşil olmalı)
npm run deploy         # guard: .env eksikse deploy İPTAL olur — bilerek
git push origin main
```

## Yapı
- `src/pages/` — rotalar (Lab=grafik+backtest, Izleme, Topluluk, Profil, Ben, Lig, Puanlar…)
- `src/components/` — Chart, StrategyExtractor, MobileTabBar/Menu, BadgeStrip…
- `src/lib/` — motorlar: detectors, backtest, ranks, brier, points, badges, achievements, paramsBlock, codegen, strategyExtractor, supabase
- `src/styles/` — CSS; `tests/` — motor.test.js + render duman testi
- `docs/` — Master Registry + lig yönetim SQL'leri; `supabase/` — şema/notlar
- `CLAUDE.md` — Claude Code oturum kuralları (her oturum önce bunu okur)

## Güvenlik modeli
Statik site + Supabase: **anon key bilinçli olarak public'tir**, gerçek güvenlik RLS
politikalarındadır. `service_role` anahtarı ve SMTP şifresi repoya/istemciye ASLA girmez.
`.env` commit'lenmez (guard + gitignore).

## Katkı kuralları
- Test + implementasyon AYNI commit'te (17 Tem dersinden kalıcı kural).
- Yeni AK/D numarası atamadan önce `docs/AK_MASTER_REGISTRY.json` okunur.
- `basename='/altinkulak'`, `vite.config.js base`, `ranks.js`, sandbox izolasyonu dokunulmaz.
