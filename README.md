# Altınkulak

Türkçe, AI destekli, istatistik temelli trading **eğitim + simülasyon** platformu.
Slogan: *Gürültüyü değil, sinyali duy.*

## Çalıştır
```
npm install
npm run dev
```
Tarayıcıda `http://localhost:5173/altinkulak/` aç.

## Yapı
- `src/pages/` — Home + tüm route sayfaları (Lab ve Ogren işlevsel iskelet, diğerleri stub)
- `src/components/` — Navbar, Footer, Hero, kartlar, PageShell
- `src/lib/homeData.js` — ana sayfa verisi + dalga formu
- `src/styles/` — global / home / lab / ogren CSS

## Kurallar
`CLAUDE.md` projenin kök kurallarıdır. Claude Code her oturumda önce onu okur.
Devam eden işler `BUILD_LOG.md` içinde handoff olarak sıralı.

## DOKUNULMAZ
- `BrowserRouter basename="/altinkulak"` (main.jsx)
- `vite.config.js` → `base: '/altinkulak/'`

## Deploy
```
npm run deploy
git add . && git commit -m "..." && git push origin master:main --force
```
