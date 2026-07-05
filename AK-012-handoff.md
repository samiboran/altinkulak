# Devir AK-012 (kalan) — "Taktiği test et" + SL/TP grafikte

> Şu an: grafik (Chart.jsx) + dedektörler (detectors.js) gerçek, Lab'da kavram filtresi katmanları çiziyor.
> Eksik: seçili kavram **kombinasyonunu backtest motoruna bağlayıp** test etmek, sonucu grafikte SL/TP + giriş işaretiyle göstermek, ve "fazla filtre edge'i seyreltir"i sayıyla kanıtlamak.
> Bu mapping'i sırayla uygula. Uzun kod sende; karar/iskelet burada.

---

## handoff (JSON)
```json
{
  "task_id": "AK-012b",
  "title": "Kavram kombinasyonu -> backtest + SL/TP grafikte",
  "goal": "Lab'da seçili kavramlarla 'Backtest çalıştır' tek taktik gibi test etsin; trade'ler ve SL/TP grafikte görünsün; kavram eklendikçe t-stat değişsin.",
  "files": [
    { "path": "src/lib/backtest.js", "action": "edit", "role": "runBacktest concepts alsın; simulate trade nesnesi (index+sl+tp) dönsün; sonuç trades[] içersin", "status": "todo" },
    { "path": "src/lib/detectors.js", "action": "edit", "role": "OB/BOS hizalama yardımcıları (girişi filtrelemek için)", "status": "todo" },
    { "path": "src/components/Chart.jsx", "action": "edit", "role": "trades prop'u: giriş üçgeni + SL (kırmızı) / TP (yeşil) çizgileri", "status": "todo" },
    { "path": "src/pages/Lab.jsx", "action": "edit", "role": "run() concepts'i geçsin; res.trades'i Chart'a versin", "status": "todo" }
  ],
  "decisions": {
    "kombinasyon": "Kavramlar AND'lenir: FVG girişi yalnızca seçili diğer kavramlarla HİZALIYSA alınır (örn. OB seçiliyse giriş bir OB bölgesine yakın olmalı; BOS seçiliyse trend yönü doğrulanmalı)",
    "edge_dersi": "AND'lemek işlem sayısını düşürür → t-stat değişir; çoğu zaman düşer. Bu KASITLI ve gerçek (Sami'nin bulgusu). Sahte iyileştirme YOK.",
    "durustluk": "verdict mantığı (t>=2 ve kontrol grubu) AYNI kalır — dokunma",
    "sl_tp": "1R = ATR; SL = giriş ∓ 1R, TP = giriş ± rr*R (mevcut simulate ile tutarlı)"
  },
  "do_not_touch": [
    "stats.js verdict/tStat/kontrol grubu mantığı",
    "lookahead-bias engeli (giriş/sonuç sadece sonraki barlarla)",
    "tasarım token'ları ve grafik renkleri"
  ],
  "todo_for_cc": [
    "simulate(): her trade için {entryIdx, dir, entry, stop, target, outcome} dönsün (sadece R değil)",
    "runBacktest(bars,{rr,maxGapATR,concepts}): concepts'e göre gaps'i filtrele; sonuca trades[] ekle",
    "detectors.js: isNearOB(bar,obs), trendOk(i,bars) gibi küçük hizalama yardımcıları",
    "Chart.jsx: trades prop'u al; son ~10 trade'in giriş işaretini, seçili/son trade'in SL+TP çizgisini çiz",
    "Lab.jsx: run() -> runBacktest(getBars(symbol),{rr,maxGapATR:gap,concepts}); setRes; <Chart ... trades={res?.trades}/>"
  ],
  "acceptance": [
    "Sadece FVG: bugünkü sonuç (SOL ~t3.4) korunur",
    "FVG+OrderBlock+BOS: işlem sayısı düşer, t-stat değişir (çoğu kez azalır)",
    "Grafikte en az son trade'in SL (kırmızı) ve TP (yeşil) çizgisi + giriş işareti görünür",
    "Konsol hatası yok, npm run build temiz"
  ],
  "commands": ["npm run dev", "npm run build"]
}
```

---

## Mapping / Briefing (sırayla)

**1. simulate()'i trade nesnesi döndürür yap.** `backtest.js` içinde simulate şu an R değerleri (`outcome`) topluyor. Bunun yerine her işlem için `{ entryIdx, dir, entry, stop, target, outcome }` döndür. `runBacktest` metrikleri yine `outcome`'lardan hesaplar (`trades.map(t=>t.outcome)`).

**2. runBacktest'e `concepts` ekle.** İmza: `runBacktest(bars, { rr = 3, maxGapATR = 0.6, concepts = ["fvg"] } = {})`. FVG'leri bul (mevcut). Eğer `concepts` OB içeriyorsa, girişleri **OB bölgesine yakın** olanlarla; BOS içeriyorsa **trend yönü doğrulanan**larla filtrele (AND). Kalan gap'lerle simulate çalışsın.

**3. detectors.js'e küçük hizalama yardımcıları.** `isNearOB(price, obs, tol)` ve `trendOk(i, bars)` (örn. EMA50 eğimi). Bunlar girişi filtrelemek için; ağır değil.

**4. Chart.jsx `trades` prop'u.** Her trade için giriş barına küçük üçgen (yön renginde). Seçili/son trade için yatay **SL** (kırmızı kesikli) ve **TP** (yeşil kesikli) çizgileri (entry±). `gi(entryIdx)` ile view'a hizala; view dışındakini atla.

**5. Lab.jsx bağla.** `run()` içinde `runBacktest(getBars(symbol), { rr, maxGapATR: gap, concepts })`. `<Chart bars={getBars(symbol)} concepts={concepts} showEma={showEma} trades={res?.trades} />`. Sonuç paneli zaten verdict gösteriyor — dokunma.

**6. Doğrula (acceptance).** Önce sadece FVG → eski sonuç. Sonra OB+BOS ekle → işlem sayısı düşsün, t değişsin. Grafikte SL/TP görünsün. `npm run build` temiz.

**Kritik:** Hiçbir adımda t-stat'ı "iyileştirmek" için ayar yapma. Fazla filtre t'yi düşürüyorsa **doğru olan budur** — markanın tüm tezi bu.

---

## Bundan sonrası (sıra)
- **AK-013** — Timeline scrubber + katman şeritleri (Onizleme_Timeline.jsx). Chart'a windowed bars + perde kolları + ay etiketleri + Likidite/Hacim şeritleri.
- **AK-012c** — Mitigation / Order Flow / Fibonacci dedektörleri (çipler var, mantık yok).
- **AK-014** — Mesajlaşma + ss-kırp-gönder (Supabase Realtime/Storage + html2canvas + cooldown).
- **Stub sayfalar** (dış bağımlılık yok, istersen sohbet tarafında bitiririm): Profil, Fiyatlandırma, Giriş arayüzü.
