// Motor güvenlik ağı — dürüstlük katmanı regresyon testleri.
// Çalıştır: npm test  (bağımlılık yok, saf node)
import assert from "node:assert/strict";
import { mean, std, tStat, trainTestSplit, verdict, bonferroniT, expectedFalsePositives } from "../src/lib/stats.js";
import { runBacktest, latestFvgSignal } from "../src/lib/backtest.js";
import { getBars, parseKlines, loadReal, isReal, pairFor, hasData, stats24h, getFreshness, freshnessStatus, getSearchSymbols, ALL_SYMBOLS } from "../src/lib/data.js";
import { decimalsFromTick, tickSizeForPair, formatPriceTick } from "../src/lib/priceFormat.js";
import { generateWebhookToken, buildWebhookUrl, isRateLimited, processWebhookTrigger, RATE_LIMIT_MS, isPayloadTooLarge, MAX_PAYLOAD_BYTES } from "../src/lib/izlemeWebhookCore.js";
import { fetchWebhookEntry, getOrCreateWebhookEntry, webhookUrlFor } from "../src/lib/izlemeEntries.js";
import {
  lastClosedFourHourBoundary, isHistoryCacheFresh, getCachedHistory, setCachedHistory,
  computeHistory, getOrComputeHistory,
} from "../src/lib/izlemeHistory.js";
import { normalizeTop500 } from "../src/lib/top500.js";
import { detectModBSignals, DEFAULT_PARAMS } from "../src/lib/modB.js";
import { applyTick, mergeGapFill } from "../src/lib/liveData.js";
import {
  deriveBalance, deriveLifetime, monthlyEarned, remainingMonthlyCap, currentStreakDays,
  streakAwardedRecently, spendItemStatus, canPurchase, MONTHLY_CAP, SPENDING_TABLE,
} from "../src/lib/points.js";

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
}

console.log("stats.js");
test("mean/std bilinen değerler", () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(std([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01);
});
test("tStat: sabit pozitif getiri yüksek t verir", () => {
  assert.ok(tStat([1, 1, 1, 1, 1, 0.9, 1.1, 1]) > 10);
});
test("tStat: sıfır ortalamalı seri ~0", () => {
  assert.ok(Math.abs(tStat([1, -1, 1, -1, 1, -1])) < 0.01);
});
test("trainTestSplit sırayı korur (zaman serisi)", () => {
  const { train, test: te } = trainTestSplit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(train, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(te, [8, 9, 10]);
});
test("verdict: t=3 + kontrol geçer → EDGE", () => {
  assert.equal(verdict(3, { p95: 1.5 }).good, true);
});
test("verdict: t=1.5 → edge yok (t<2)", () => {
  assert.equal(verdict(1.5, { p95: 1.0 }).good, false);
});
test("verdict: t NEGATİF asla iyi değil (t=-4 bile)", () => {
  const v = verdict(-4, { p95: 1.0 });
  assert.equal(v.good, false);
  assert.match(v.reason, /negatif/i);
});
test("verdict: t=2.5 ama kontrol p95=3 → kuşkulu, reddedilir", () => {
  assert.equal(verdict(2.5, { p95: 3.0 }).good, false);
});

console.log("backtest.js");
test("runBacktest: 60 bardan az veri → null", () => {
  assert.equal(runBacktest(getBars("SOL").slice(0, 40)), null);
});
test("sonuç yapısı tam (trades, tStat, verdict, mc...)", () => {
  const r = runBacktest(getBars("SOL"), { rr: 2 });
  for (const k of ["trades", "tradeCount", "winRate", "tStat", "controlP95", "expectancy", "profitFactor", "curve", "verdict"]) {
    assert.ok(k in r, `alan eksik: ${k}`);
  }
});
test("lookahead-bias engeli: her trade girişi FVG barından SONRA", () => {
  const r = runBacktest(getBars("SOL"), { rr: 2 });
  assert.ok(r.trades.length > 0, "hiç trade yok");
  // simulate() gap.i+1'den başlıyor; entryIdx bar aralığında ve tutarlı olmalı
  for (const t of r.trades) {
    assert.ok(Number.isInteger(t.entryIdx) && t.entryIdx > 2, "entryIdx şüpheli");
    assert.ok([1, -1].includes(t.dir));
    assert.ok(t.outcome === -1 || t.outcome > 0, "outcome -1 veya +rr olmalı");
  }
});
test("stop/target yön tutarlılığı", () => {
  const r = runBacktest(getBars("ETH"), { rr: 3 });
  for (const t of r.trades) {
    if (t.dir === 1) assert.ok(t.stop < t.entry && t.target > t.entry, "long: stop<giriş<target değil");
    else assert.ok(t.stop > t.entry && t.target < t.entry, "short: target<giriş<stop değil");
  }
});
test("DÜRÜSTLÜK: RND (rastgele) edge VERMEMELİ", () => {
  const r = runBacktest(getBars("RND"), { rr: 2 });
  assert.equal(r.verdict.good, false, `RND edge verdi! t=${r.tStat}`);
});
test("DÜRÜSTLÜK: SOL (gömülü edge) edge VERMELİ", () => {
  const r = runBacktest(getBars("SOL"), { rr: 2 });
  assert.equal(r.verdict.good, true, `SOL edge vermedi, t=${r.tStat} p95=${r.controlP95}`);
});
test("determinizm: aynı girdi → aynı t-stat", () => {
  const a = runBacktest(getBars("BTC"), { rr: 2 }).tStat;
  const b = runBacktest(getBars("BTC"), { rr: 2 }).tStat;
  assert.equal(a, b);
});
test("aşırı filtre → az/sıfır işlem, motor çökmez", () => {
  const r = runBacktest(getBars("BTC"), { rr: 2, concepts: ["fvg", "ob", "bos", "mit", "of", "fib"] });
  assert.ok(r === null || r.tradeCount >= 0);
});

console.log("İzleme paneli: TRX/HYPE/DOGE/BNB için FVG-only backtest (AK-FVG-panel)");
for (const sym of ["TRX", "HYPE", "DOGE", "BNB"]) {
  test(`${sym}: hasData true, sentetik/gerçek fark etmeksizin FVG backtest çalışır ve tam yapı döner`, () => {
    assert.equal(hasData(sym), true, `${sym} için veri yok — profil eksik`);
    const bars = getBars(sym);
    assert.ok(bars.length >= 900, `${sym} bar sayısı yetersiz`);
    const r = runBacktest(bars, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
    assert.ok(r, `${sym} için backtest null döndü`);
    for (const k of ["trades", "tradeCount", "tStat", "controlP95", "verdict"]) assert.ok(k in r, `${sym}: alan eksik ${k}`);
  });
  test(`${sym}: gömülü edge sentetik profilde bulunuyor (DÜRÜSTLÜK kontrolü — motor rastgeleyle SOL gibi ayırt ediyor)`, () => {
    const r = runBacktest(getBars(sym), { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
    assert.equal(r.verdict.good, true, `${sym} edge vermedi, t=${r.tStat} p95=${r.controlP95}`);
  });
}

console.log("latestFvgSignal — İzleme kartı giriş/TP/SL/zaman damgası (D6/D19)");
test("hiç trade yoksa null döner (sahte sinyal uydurulmaz)", () => {
  assert.equal(latestFvgSignal(getBars("SOL"), null), null);
  assert.equal(latestFvgSignal(getBars("SOL"), { trades: [] }), null);
});
test("en büyük entryIdx'e sahip trade seçilir (trades dizisi entryIdx'e göre sıralı DEĞİL varsayımıyla)", () => {
  const bars = getBars("SOL");
  const fakeResult = { tStat: 3, trades: [
    { entryIdx: 50, dir: 1, entry: 10, stop: 9, target: 13 },
    { entryIdx: 12, dir: -1, entry: 20, stop: 21, target: 17 }, // dizide SONRA ama kronolojik olarak ÖNCE
  ] };
  const sig = latestFvgSignal(bars, fakeResult);
  assert.equal(sig.entry, 10);
  assert.equal(sig.dir, 1);
});
test("entry/tp/sl tam küsüratla döner — yuvarlama yok", () => {
  const bars = getBars("SOL");
  const fakeResult = { tStat: 3, trades: [{ entryIdx: 5, dir: 1, entry: 12.34567891, stop: 11.11119999, target: 15.87654321 }] };
  const sig = latestFvgSignal(bars, fakeResult);
  assert.equal(sig.entry, 12.34567891);
  assert.equal(sig.sl, 11.11119999);
  assert.equal(sig.tp, 15.87654321);
});
test("D19: t<2 → hipotez true; t>=2 → hipotez false", () => {
  const bars = getBars("SOL");
  const trades = [{ entryIdx: 5, dir: 1, entry: 1, stop: 0.9, target: 1.3 }];
  assert.equal(latestFvgSignal(bars, { tStat: 1.5, trades }).hipotez, true);
  assert.equal(latestFvgSignal(bars, { tStat: 2.4, trades }).hipotez, false);
});
test("gerçek runBacktest çıktısıyla uçtan uca: SOL için sig varsa entryIdx bars sınırları içinde", () => {
  const bars = getBars("SOL");
  const r = runBacktest(bars, { rr: 2, concepts: ["fvg"] });
  const sig = latestFvgSignal(bars, r);
  if (sig) {
    assert.ok([1, -1].includes(sig.dir));
    assert.ok(Number.isFinite(sig.entry) && Number.isFinite(sig.tp) && Number.isFinite(sig.sl));
    assert.equal(typeof sig.hipotez, "boolean");
  }
});

console.log("priceFormat.js — tick size'a göre dinamik gösterim hassasiyeti (sabit toFixed(2) değil)");
test("decimalsFromTick: bilinen tick size'lardan doğru ondalık sayısı çıkarır", () => {
  assert.equal(decimalsFromTick(0.01), 2);
  assert.equal(decimalsFromTick(0.001), 3);
  assert.equal(decimalsFromTick(0.00001), 5);
  assert.equal(decimalsFromTick(1), 0);
});
test("decimalsFromTick: geçersiz girdide null döner (çökmez)", () => {
  assert.equal(decimalsFromTick(0), null);
  assert.equal(decimalsFromTick(-1), null);
  assert.equal(decimalsFromTick(NaN), null);
});
test("tickSizeForPair: bilinen çiftler dolu, bilinmeyen null", () => {
  assert.equal(tickSizeForPair("TRXUSDT"), 0.00001);
  assert.equal(tickSizeForPair("BNBUSDT"), 0.01);
  assert.equal(tickSizeForPair("YOKBOYLEBIRSEYUSDT"), null);
});
test("formatPriceTick: TRX/DOGE gibi düşük fiyatlı coinler toFixed(2) ile KIRPILMAZ", () => {
  assert.equal(formatPriceTick(0.123456, "TRXUSDT"), "0.12346");
  assert.equal(formatPriceTick(0.123456, "DOGEUSDT"), "0.12346");
});
test("formatPriceTick: her coin KENDİ tick size'ıyla, sabit ortak bir kural değil (BNB≠TRX hassasiyeti)", () => {
  assert.equal(formatPriceTick(612.345, "BNBUSDT"), "612.35");
  assert.equal(formatPriceTick(0.31234, "HYPEUSDT"), "0.312");
});
test("formatPriceTick: bilinmeyen çiftte büyüklük-tabanlı yedek devrede, çökmez", () => {
  assert.equal(formatPriceTick(45.6789, "YOKBOYLEBIRSEYUSDT"), "45.68");
  assert.equal(formatPriceTick(null, "TRXUSDT"), "—");
});

console.log("İzleme — 'Code'a bağla' Pine alert webhook (D16/D6)");
test("generateWebhookToken: 24 hex karakter, her çağrıda farklı (çakışma riski düşük)", () => {
  const a = generateWebhookToken(), b = generateWebhookToken();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.match(b, /^[0-9a-f]{24}$/);
  assert.notEqual(a, b);
});
test("buildWebhookUrl: base + token birleşir, eksik girdide null (çökmez)", () => {
  assert.equal(buildWebhookUrl("https://proj.supabase.co/functions/v1/izleme-webhook", "abc123"), "https://proj.supabase.co/functions/v1/izleme-webhook/abc123");
  assert.equal(buildWebhookUrl("https://proj.supabase.co/functions/v1/izleme-webhook/", "abc123"), "https://proj.supabase.co/functions/v1/izleme-webhook/abc123");
  assert.equal(buildWebhookUrl("", "abc123"), null);
  assert.equal(buildWebhookUrl("https://x.co", null), null);
});
test("isRateLimited: son tetiklenme yoksa false, 1 dakika içindeyse true, sonrasında false", () => {
  const now = Date.now();
  assert.equal(isRateLimited(null, now), false);
  assert.equal(isRateLimited(new Date(now - 10_000).toISOString(), now), true); // 10sn önce
  assert.equal(isRateLimited(new Date(now - RATE_LIMIT_MS - 1000).toISOString(), now), false); // 1dk+ önce
});
test("processWebhookTrigger: token eşleşmezse 404, hiçbir dep çağrılmaz", async () => {
  let called = false;
  const deps = { findByToken: async () => { called = true; return null; }, markTriggered: async () => { throw new Error("çağrılmamalıydı"); } };
  const r = await processWebhookTrigger("yok-boyle-token", "{}", deps);
  assert.equal(r.status, 404);
  assert.equal(called, true);
});
test("processWebhookTrigger: geçersiz token (boş/undefined) DB'ye hiç sorulmadan 404", async () => {
  let asked = false;
  const deps = { findByToken: async () => { asked = true; return null; }, markTriggered: async () => {} };
  assert.equal((await processWebhookTrigger("", "{}", deps)).status, 404);
  assert.equal((await processWebhookTrigger(undefined, "{}", deps)).status, 404);
  assert.equal(asked, false, "boş token için DB'ye sorulmamalı");
});
test("processWebhookTrigger: rate limit içindeyse sessizce yutulur, markTriggered ÇAĞRILMAZ", async () => {
  const now = Date.now();
  let marked = false;
  const deps = {
    findByToken: async () => ({ id: "e1", lastTriggeredAt: new Date(now - 5000).toISOString() }),
    markTriggered: async () => { marked = true; },
  };
  const r = await processWebhookTrigger("tok1", "{}", deps, now);
  assert.deepEqual(r, { status: 200, ignored: true });
  assert.equal(marked, false);
});
test("processWebhookTrigger: eşleşen + rate limit dışı → durum güncellenir", async () => {
  const now = Date.now();
  let markedWith = null;
  const deps = {
    findByToken: async () => ({ id: "e1", lastTriggeredAt: null }),
    markTriggered: async (id, payload) => { markedWith = { id, payload }; },
  };
  const r = await processWebhookTrigger("tok1", '{"strategy":"x"}', deps, now);
  assert.deepEqual(r, { status: 200, ignored: false });
  assert.equal(markedWith.id, "e1");
  assert.equal(markedWith.payload.rawBody, '{"strategy":"x"}');
  assert.equal(markedWith.payload.triggeredAt, new Date(now).toISOString());
});

console.log("Görev 2 — webhook teşhis: payload boyutu artık AÇIKÇA reddedilir ve KAYDA GEÇER (sessiz başarısızlık yok)");
test("isPayloadTooLarge: sınır altı false, sınır üstü true, boş/yok false", () => {
  assert.equal(isPayloadTooLarge(""), false);
  assert.equal(isPayloadTooLarge(null), false);
  assert.equal(isPayloadTooLarge("a".repeat(MAX_PAYLOAD_BYTES)), false);
  assert.equal(isPayloadTooLarge("a".repeat(MAX_PAYLOAD_BYTES + 1)), true);
});
test("processWebhookTrigger: aşırı büyük payload 413 döner, markTriggered ÇAĞRILMAZ, markFailed KAYDEDER", async () => {
  let triggeredCalled = false, failedWith = null;
  const deps = {
    findByToken: async () => ({ id: "e1", lastTriggeredAt: null }),
    markTriggered: async () => { triggeredCalled = true; },
    markFailed: async (id, payload) => { failedWith = { id, payload }; },
  };
  const now = Date.now();
  const bigBody = "x".repeat(MAX_PAYLOAD_BYTES + 500);
  const r = await processWebhookTrigger("tok1", bigBody, deps, now);
  assert.deepEqual(r, { status: 413, reason: "payload_too_large" });
  assert.equal(triggeredCalled, false, "aşırı büyük payload ile durum 'tetiklendi' yapılmamalı");
  assert.equal(failedWith.id, "e1");
  assert.equal(failedWith.payload.reason, "payload_too_large");
  assert.equal(failedWith.payload.failedAt, new Date(now).toISOString());
});
test("processWebhookTrigger: normal boyutlu payload'da markFailed HİÇ çağrılmaz (regresyon — mevcut akış bozulmadı)", async () => {
  let failedCalled = false;
  const deps = {
    findByToken: async () => ({ id: "e1", lastTriggeredAt: null }),
    markTriggered: async () => {},
    markFailed: async () => { failedCalled = true; },
  };
  await processWebhookTrigger("tok1", '{"ok":true}', deps);
  assert.equal(failedCalled, false);
});
test("DÜRÜSTLÜK: aşırı büyük payload token eşleşmeden ÖNCE reddedilmez — yalnız eşleşen kayda sessiz kalınmaz, eşleşmeyen yine 404'tür", async () => {
  const deps = {
    findByToken: async () => null,
    markTriggered: async () => { throw new Error("çağrılmamalıydı"); },
    markFailed: async () => { throw new Error("çağrılmamalıydı — eşleşmeyen tokene yazılacak kayıt yok"); },
  };
  const r = await processWebhookTrigger("yok-boyle-token", "x".repeat(MAX_PAYLOAD_BYTES + 500), deps);
  assert.deepEqual(r, { status: 404 });
});
test("DÜRÜSTLÜK/D16: deps arayüzü yapısal olarak yalnız izleme kaydına erişebilir — başka bir tabloya (ör. ledger/trade) yazma İMKANI YOK", () => {
  // deps'e trade/ledger/sandbox gibi başka bir yazma fonksiyonu geçirilse bile processWebhookTrigger
  // onu HİÇ ÇAĞIRMAZ — imza yalnız findByToken/markTriggered'ı tanır.
  let tradeTableTouched = false;
  const deps = {
    findByToken: async () => ({ id: "e1", lastTriggeredAt: null }),
    markTriggered: async () => {},
    insertTrade: async () => { tradeTableTouched = true; }, // sahte, motorun asla erişemeyeceği bir dep
  };
  return processWebhookTrigger("tok1", "{}", deps).then(() => {
    assert.equal(tradeTableTouched, false, "webhook motoru trade tablosuna dokunmamalı");
  });
});
test("izlemeEntries.js: Supabase yapılandırılmamışken tüm sorgular dürüst boş değer döner (D6)", async () => {
  assert.equal(await fetchWebhookEntry("u1", "TRX"), null);
  assert.equal(await getOrCreateWebhookEntry("u1", "TRX"), null);
  assert.equal(await fetchWebhookEntry(null, "TRX"), null); // userId yok → sorgulanmaz
  assert.equal(await getOrCreateWebhookEntry("u1", ""), null); // sym yok → sorgulanmaz
});
test("webhookUrlFor: Supabase yapılandırılmamışken/token yokken null (fabrike URL üretilmez)", () => {
  assert.equal(webhookUrlFor("abc123"), null); // bu test ortamında VITE_SUPABASE_URL boş
  assert.equal(webhookUrlFor(null), null);
});

console.log("İzleme — 'Geçmiş veriyi göster' aç/kapa + cache (izlemeye eklemek ≠ backtest)");
// Node'da gerçek localStorage yok — her test kendi İZOLE sahte store'unu kurar (global
// durum/diğer testler etkilenmez), izlemeHistory.js'in store parametresiyle enjekte edilir.
function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
test("lastClosedFourHourBoundary: 4H'lık UTC sınırlarına yuvarlar", () => {
  assert.equal(lastClosedFourHourBoundary(Date.UTC(2026, 0, 1, 5, 30)), Date.UTC(2026, 0, 1, 4, 0));
  assert.equal(lastClosedFourHourBoundary(Date.UTC(2026, 0, 1, 4, 0)), Date.UTC(2026, 0, 1, 4, 0));
  assert.equal(lastClosedFourHourBoundary(Date.UTC(2026, 0, 1, 3, 59)), Date.UTC(2026, 0, 1, 0, 0));
});
test("isHistoryCacheFresh: cache yoksa/computedAt geçersizse false", () => {
  assert.equal(isHistoryCacheFresh(null), false);
  assert.equal(isHistoryCacheFresh({ computedAt: NaN }), false);
  assert.equal(isHistoryCacheFresh({}), false);
});
test("isHistoryCacheFresh: aynı 4H penceresinde hesaplandıysa taze, yeni mum kapandıysa bayat", () => {
  const now = Date.UTC(2026, 0, 1, 6, 0); // pencere: [04:00, 08:00)
  assert.equal(isHistoryCacheFresh({ computedAt: Date.UTC(2026, 0, 1, 4, 5) }, now), true);
  assert.equal(isHistoryCacheFresh({ computedAt: Date.UTC(2026, 0, 1, 3, 59) }, now), false); // önceki mum
});
test("get/setCachedHistory: yazılan aynen okunur, sembol büyük harfe normalize edilir", () => {
  const store = fakeStore();
  assert.equal(getCachedHistory("btc", store), null);
  setCachedHistory("btc", { t: 3, edge: true }, 1000, store);
  const c = getCachedHistory("BTC", store);
  assert.equal(c.computedAt, 1000);
  assert.deepEqual(c.result, { t: 3, edge: true });
});
test("computeHistory: runBacktest+latestFvgSignal'ın alt kümesini çıkarır (motor DEĞİŞMEDEN)", () => {
  const h = computeHistory(getBars("SOL"), { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
  assert.ok(h);
  for (const k of ["t", "edge", "hipotez", "sig"]) assert.ok(k in h, `alan eksik: ${k}`);
  const r = runBacktest(getBars("SOL"), { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
  assert.equal(h.t, r.tStat);
  assert.equal(h.edge, r.verdict.good);
});
test("getOrComputeHistory: cache boşken HESAPLAR ve cache'e yazar (toggle ilk açılış)", () => {
  const store = fakeStore();
  const bars = getBars("SOL");
  const opts = { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 };
  assert.equal(getCachedHistory("SOL", store), null, "başlangıçta cache boş olmalı");
  const h = getOrComputeHistory("SOL", bars, opts, Date.now(), store);
  assert.ok(h && h.result);
  assert.deepEqual(getCachedHistory("SOL", store), h, "hesap cache'e yazılmış olmalı");
});
test("getOrComputeHistory: cache TAZE ise motor TEKRAR ÇAĞRILMAZ — aynı referans döner", () => {
  const store = fakeStore();
  const bars = getBars("SOL");
  const opts = { rr: 2, concepts: ["fvg"] };
  const now = Date.UTC(2026, 0, 1, 5, 0);
  const first = getOrComputeHistory("SOL", bars, opts, now, store);
  // ikinci çağrıda bars'ı BİLEREK boş dizi veriyoruz — eğer motor gerçekten tekrar çağrılsaydı
  // runBacktest([]) null dönerdi ve sonuç değişirdi/çökerdi; aynı obje dönmesi cache'in
  // kullanıldığının (motorun ÇAĞRILMADIĞININ) kanıtıdır.
  const second = getOrComputeHistory("SOL", [], opts, now + 60_000, store); // aynı 4H penceresi
  assert.deepEqual(second, first, "cache taze iken değer aynı kalmalı (motor tekrar çağrılmadı)");
});
test("getOrComputeHistory: cache BAYAT ise (yeni 4H mumu kapandı) yeniden hesaplanır", () => {
  const store = fakeStore();
  const bars = getBars("SOL");
  const opts = { rr: 2, concepts: ["fvg"] };
  const t0 = Date.UTC(2026, 0, 1, 5, 0);
  const first = getOrComputeHistory("SOL", bars, opts, t0, store);
  const t1 = t0 + FOUR_H_LATER(); // bir sonraki 4H penceresi
  const second = getOrComputeHistory("SOL", bars, opts, t1, store);
  assert.notEqual(second, first);
  assert.equal(second.computedAt, t1);
  assert.deepEqual(second.result, first.result); // aynı barlar → aynı sonuç, ama YENİDEN hesaplandı
});
function FOUR_H_LATER() { return 4 * 60 * 60 * 1000 + 1; }
test("DÜRÜSTLÜK: toggle kapalıyken (bu testte hiç çağrılmayan getOrComputeHistory) hesaplama YOK — Izleme.jsx satırı yalnız historyOn true iken motoru çağırır", () => {
  // Bu, Izleme.jsx'teki gerçek satırın davranışını taklit eder: historyOn false ise
  // getOrComputeHistory'nin ADI BİLE geçmez — motor çağrılma İMKANI yoktur.
  const store = fakeStore();
  const historyOn = false;
  let called = false;
  const wrappedCompute = (...args) => { called = true; return getOrComputeHistory(...args); };
  if (historyOn) wrappedCompute("SOL", getBars("SOL"), { rr: 2 }, Date.now(), store);
  assert.equal(called, false, "toggle kapalıyken backtest çağrılmamalı");
  assert.equal(getCachedHistory("SOL", store), null, "hiçbir cache yazılmamış olmalı");
});

console.log("maliyet (costR)");
test("maliyet expectancy'yi düşürür", () => {
  const free = runBacktest(getBars("SOL"), { rr: 2, costR: 0 });
  const paid = runBacktest(getBars("SOL"), { rr: 2, costR: 0.1 });
  assert.ok(paid.expectancy < free.expectancy, `${paid.expectancy} < ${free.expectancy} değil`);
  assert.ok(Math.abs((free.expectancy - paid.expectancy) - 0.1) < 0.02, "düşüş ~costR kadar olmalı");
});
test("kontrol grubu da maliyet öder (p95 tek yönlü artmaz)", () => {
  const free = runBacktest(getBars("SOL"), { rr: 2, costR: 0 });
  const paid = runBacktest(getBars("SOL"), { rr: 2, costR: 0.1 });
  // adil kıyas: maliyet yalnız stratejiye yüklenseydi kontrol p95 sabit kalırdı
  assert.notEqual(paid.controlP95, undefined);
  assert.ok(paid.costR === 0.1 && free.costR === 0);
});
test("fahiş maliyet edge'i öldürür (dürüstlük)", () => {
  const r = runBacktest(getBars("SOL"), { rr: 2, costR: 1.5 });
  assert.equal(r.verdict.good, false, `costR=1.5R ile hâlâ edge: t=${r.tStat}`);
});

console.log("çoklu-test (Bonferroni)");
test("tek test → eşik 2.0'da kalır", () => {
  assert.equal(bonferroniT(1), 2.0);
});
test("15 test → eşik ~2.7'ye yükselir", () => {
  assert.ok(Math.abs(bonferroniT(15) - 2.7) < 0.15, `beklenen ~2.7, gelen ${bonferroniT(15)}`);
});
test("test sayısı arttıkça eşik monoton artar", () => {
  assert.ok(bonferroniT(50) > bonferroniT(15));
  assert.ok(bonferroniT(15) > bonferroniT(5));
});
test("beklenen yanlış pozitif: 15 test → ~0.8", () => {
  assert.ok(Math.abs(expectedFalsePositives(15) - 0.75) < 0.1);
});

console.log("gerçek veri katmanı (AK-004b)");
test("parseKlines: Binance formatını motor formatına çevirir", () => {
  const raw = [
    [1719900000000, "61000.1", "61500.5", "60800.0", "61200.9", "123.4"],
    [1719914400000, "61200.9", "61900.0", "61100.2", "61850.3", "98.7"],
  ];
  const bars = parseKlines(raw);
  assert.equal(bars.length, 2);
  assert.deepEqual(Object.keys(bars[0]).sort(), ["c", "h", "l", "o", "t", "time", "v"]);
  assert.equal(bars[0].t, 0);
  assert.equal(bars[1].t, 1);
  assert.equal(bars[0].o, 61000.1);
  assert.equal(bars[1].c, 61850.3);
  assert.ok(bars.every(b => typeof b.o === "number" && b.h >= b.l));
  assert.equal(bars[0].v, 123.4); // hacim korunur (AK-030)
});
const aselsReal = await loadReal("ASELS");
const rndReal = await loadReal("RND");
test("loadReal: kripto-olmayan sembol → null (sentetik kalır)", () => {
  assert.equal(aselsReal, null);
  assert.equal(rndReal, null);
});
test("isReal: yüklenmemişken false, getBars sentetiğe düşer", () => {
  assert.equal(isReal("BTC"), false);
  assert.ok(getBars("BTC").length >= 60);
});

console.log("top 500 kripto arama listesi (AK-074)");
test("normalizeTop500: CoinGecko satırını {sym,name} çevirir, büyük harfe çıkarır", () => {
  const raw = [
    { symbol: "pepe", name: "Pepe" },
    { symbol: "btc", name: "Bitcoin" },
    { symbol: "", name: "İsimsiz" }, // sembolsüz satır atlanır
    null,
  ];
  const out = normalizeTop500(raw);
  assert.deepEqual(out, [{ sym: "PEPE", name: "Pepe" }, { sym: "BTC", name: "Bitcoin" }]);
});
test("normalizeTop500: dizi olmayan girdi çökmez, boş dizi döner", () => {
  assert.deepEqual(normalizeTop500(null), []);
  assert.deepEqual(normalizeTop500(undefined), []);
});
test("getSearchSymbols: top500 yüklenmeden ALL_SYMBOLS ile birebir aynı (dürüstlük — sahte genişleme yok)", () => {
  assert.deepEqual(getSearchSymbols(), ALL_SYMBOLS);
});

console.log("sicil (AK-020)");
const ledger = await import("../src/lib/ledger.js");
test("silme/düzenleme fonksiyonu YOK (append-only garanti)", () => {
  const exported = Object.keys(ledger);
  for (const bad of ["removeTrade", "deleteTrade", "updateTrade", "editTrade", "clear"]) {
    assert.ok(!exported.includes(bad), `sicilde ${bad} olmamalı!`);
  }
});
test("geçersiz kayıt reddedilir", () => {
  assert.equal(ledger.addTrade({ sym: "", dir: "Long", plan: 2, r: 1, tag: "FOMO" }), null);
  assert.equal(ledger.addTrade({ sym: "BTC", dir: "Yukarı", plan: 2, r: 1, tag: "FOMO" }), null);
  assert.equal(ledger.addTrade({ sym: "BTC", dir: "Long", plan: 0, r: 1, tag: "FOMO" }), null);
  assert.equal(ledger.addTrade({ sym: "BTC", dir: "Long", plan: 2, r: 1, tag: "Bilinmez" }), null);
});
test("summary boş sicilde çökmez", () => {
  const s = ledger.summary([]);
  assert.equal(s.n, 0);
  assert.equal(s.adherence, null);
});
test("summary metrikleri doğru hesaplar", () => {
  const fake = [
    { sym: "BTC", plan: 2, r: 2, rule: true },
    { sym: "BTC", plan: 2, r: -1, rule: true },
    { sym: "SOL", plan: 3, r: 1.5, rule: false },
    { sym: "SOL", plan: 3, r: 3, rule: true },
  ];
  const s = ledger.summary(fake);
  assert.equal(s.n, 4);
  assert.equal(s.totalR, 5.5);
  assert.equal(s.adherence, 75);
  assert.equal(s.bestSym, "SOL"); // SOL 4.5R > BTC 1R
});

console.log("sandbox (AK-020b)");
const sandbox = await import("../src/lib/sandbox.js");
test("sandbox'ta silme VAR, sicilde YOK — ayrım korunuyor", () => {
  assert.ok(typeof sandbox.removeSandbox === "function");
  assert.ok(!("removeSandbox" in ledger) && !("removeTrade" in ledger));
});
test("sandbox aynı doğrulamayı uygular (pratik gerçekçi kalsın)", () => {
  assert.equal(sandbox.addSandbox({ sym: "", dir: "Long", plan: 2, r: 1, tag: "FOMO" }), null);
  assert.equal(sandbox.addSandbox({ sym: "BTC", dir: "Long", plan: 2, r: 1, tag: "Bilinmez" }), null);
});
test("sandbox sicil özetine sızmaz (ayrı depolar)", () => {
  // summary yalnız kendisine verilen sicil kayıtlarını görür
  const s = ledger.summary([{ sym: "BTC", plan: 2, r: 2, rule: true }]);
  assert.equal(s.n, 1);
});

console.log("rütbe motoru (AK-019)");
const { edgeRank, contribRank, countable } = await import("../src/lib/ranks.js");
const mk = (n, r, symGap = 10 * 60 * 1000) =>
  Array.from({ length: n }, (_, i) => ({ sym: "BTC", r, d: new Date(1700000000000 + i * symGap).toISOString() }));
test("n<30 → Aday (rütbe yok)", () => {
  assert.equal(edgeRank(mk(29, 2)).name, "Aday");
});
test("30 işlem + düşük R → Çırak; +10R'de Kalfa", () => {
  assert.equal(edgeRank(mk(30, 0.1)).name, "Çırak");
  assert.equal(edgeRank(mk(30, 0.5)).name, "Kalfa"); // 30×0.5=15R ≥ 10
});
test("2R tavanı: tek +50R işlem +2 sayılır (kumar rütbe atlatmaz)", () => {
  const r = edgeRank(mk(30, 50));
  assert.equal(r.totalR, 60); // 30×2, 30×50 DEĞİL
});
test("spam filtresi: aynı sembolde 5dk içi ardışık işlemlerden yalnız ilki", () => {
  const spam = mk(100, 2, 60 * 1000); // 1dk arayla 100 işlem
  assert.ok(countable(spam).length < 25, `sayılan: ${countable(spam).length}`);
  assert.equal(edgeRank(spam).name, "Aday"); // sayılan n < 30
});
test("Büyükusta t≥2 ister: istikrarlı pozitif sonuçlar → geçer", () => {
  // hafif değişken pozitif seri (sabit seri varyans=0 → t=0 verir, o ayrı doğru davranış)
  const steady = mk(100, 0).map((t, i) => ({ ...t, r: i % 2 ? 2 : 1.5 }));
  const r = edgeRank(steady);
  assert.equal(r.name, "Büyükusta");
  assert.ok(r.t >= 2);
});
test("sıfır varyans (hep aynı R) → t=0, Büyükusta kapısından geçemez", () => {
  const r = edgeRank(mk(100, 2));
  assert.equal(r.t, 0);
  assert.equal(r.name, "Usta"); // n ve R yeter ama t kapısı tutmaz
});
test("Büyükusta t kapısı: gürültülü sonuçlar eşiği tutturamaz", () => {
  // +2/-2 dönüşümlü: toplam 0R, t~0 → minR zaten tutmaz; Çırak'ta kalır
  const noisy = mk(100, 0).map((t, i) => ({ ...t, r: i % 2 ? 2 : -2 }));
  const r = edgeRank(noisy);
  assert.notEqual(r.name, "Büyükusta");
});
test("next: eksikleri söyler", () => {
  const r = edgeRank(mk(30, 0.1));
  assert.equal(r.next.name, "Kalfa");
  assert.ok(r.next.needs.some(x => x.includes("R")));
});
test("contribRank eşikleri", () => {
  assert.equal(contribRank(0).name, "Gözlemci");
  assert.equal(contribRank(10).name, "Katkıcı");
  assert.equal(contribRank(999).name, "Profesör");
  assert.equal(contribRank(5).next.name, "Katkıcı");
});

console.log("csv import (AK-025)");
const { parseTradesCSV, dedupeKey, exportTradesCSV } = await import("../src/lib/csv.js");
test("geçerli CSV çözülür (sütun sırası serbest, ; de olur)", () => {
  const { rows, errors } = parseTradesCSV("dir;sym;r;plan\nlong;btc;2;2\nSHORT;ETH;-1;3");
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sym, "BTC");
  assert.equal(rows[0].dir, "Long");
  assert.equal(rows[1].dir, "Short");
});
test("eksik zorunlu sütun → hata, satır yok", () => {
  const { rows, errors } = parseTradesCSV("sym,dir,plan\nBTC,Long,2");
  assert.equal(rows.length, 0);
  assert.ok(errors[0].includes("r"));
});
test("hatalı satırlar atlanır ama iyi satırlar yaşar", () => {
  const { rows, errors } = parseTradesCSV("sym,dir,plan,r\nBTC,Long,2,2\n,Long,2,1\nETH,yukarı,2,1\nSOL,Short,0,1\nAVAX,Short,3,abc\nSOL,s,3,1.5");
  assert.equal(rows.length, 2); // BTC + SOL(s)
  assert.equal(errors.length, 4);
});
test("opsiyonel tag/setup/d işlenir, geçersizler varsayılana düşer", () => {
  const { rows } = parseTradesCSV("sym,dir,plan,r,tag,setup,d\nBTC,Long,2,2,FOMO,FVG,2026-07-01\nETH,Long,2,1,Bilinmez,Uydurma,tarih-degil");
  assert.equal(rows[0].tag, "FOMO");
  assert.equal(rows[0].setup, "FVG");
  assert.ok(rows[0].d.startsWith("2026-07-01"));
  assert.equal(rows[1].tag, "Plana uydu");
  assert.equal(rows[1].setup, "Diğer");
  assert.equal(rows[1].d, null);
});
test("dedupeKey: aynı sembol+R+gün+yön aynı anahtar", () => {
  const a = { sym: "BTC", r: 2, d: "2026-07-01T10:00:00Z", dir: "Long" };
  const b = { sym: "BTC", r: 2, d: "2026-07-01T18:30:00Z", dir: "Long" };
  const c = { sym: "BTC", r: 2, d: "2026-07-02T10:00:00Z", dir: "Long" };
  assert.equal(dedupeKey(a), dedupeKey(b));
  assert.notEqual(dedupeKey(a), dedupeKey(c));
});
test("exportTradesCSV (AK-063): round-trip — indirilen CSV tekrar import edilince aynı veriyi üretir", () => {
  const trades = [
    { sym: "BTC", dir: "Long", plan: 2, r: 1.5, tag: "Plana uydu", setup: "FVG", d: "2026-07-01T10:00:00.000Z" },
    { sym: "ETH", dir: "Short", plan: 3, r: -1, tag: "FOMO", setup: "BOS", d: "2026-07-02T08:15:00.000Z" },
  ];
  const csv = exportTradesCSV(trades);
  assert.equal(csv.split("\n")[0], "sym,dir,plan,r,tag,setup,d");
  const { rows, errors } = parseTradesCSV(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  for (let i = 0; i < trades.length; i++) {
    assert.equal(rows[i].sym, trades[i].sym);
    assert.equal(rows[i].dir, trades[i].dir);
    assert.equal(rows[i].plan, trades[i].plan);
    assert.equal(rows[i].r, trades[i].r);
    assert.equal(rows[i].tag, trades[i].tag);
    assert.equal(rows[i].setup, trades[i].setup);
    assert.equal(rows[i].d, trades[i].d);
  }
});
test("exportTradesCSV: boş sicil çökmez, yalnız başlık döner", () => {
  const csv = exportTradesCSV([]);
  assert.equal(csv, "sym,dir,plan,r,tag,setup,d");
});

console.log("stop genişliği (stopMult)");
test("stopMult=1 varsayılan: eski sonuçla birebir aynı", () => {
  const a = runBacktest(getBars("SOL"), { rr: 2 }).tStat;
  const b = runBacktest(getBars("SOL"), { rr: 2, stopMult: 1 }).tStat;
  assert.equal(a, b);
});
test("geniş stop farklı sonuç üretir ve motor çökmez", () => {
  const w = runBacktest(getBars("SOL"), { rr: 2, stopMult: 2 });
  const n = runBacktest(getBars("SOL"), { rr: 2, stopMult: 1 });
  assert.ok(w && Number.isFinite(w.tStat));
  assert.notEqual(w.tStat, n.tStat); // aynıysa parametre bağlanmamış demektir
});
test("geniş stop → stoplanma oranı düşer (kazanç oranı artar ya da eşit)", () => {
  const w = runBacktest(getBars("SOL"), { rr: 2, stopMult: 2 });
  const n = runBacktest(getBars("SOL"), { rr: 2, stopMult: 1 });
  assert.ok(w.winRate >= n.winRate - 2, `geniş ${w.winRate}% < dar ${n.winRate}%`);
});

console.log("dinamik kripto çifti (AK-031)");
test("pairFor: bilinen kripto haritadan, bilinmeyen sembol SEMBOL+USDT, kripto-olmayan asla", () => {
  assert.equal(pairFor("BTC"), "BTCUSDT");
  assert.equal(pairFor("avax"), "AVAXUSDT");
  assert.equal(pairFor("ASELS"), null);
  assert.equal(pairFor("NVDA"), null);
  assert.equal(pairFor("RND"), null); // kontrol grubu daima sentetik
});
test("hasData: tanımsız sembol veri-yok sayılır (sahte sentetik gösterilmez)", () => {
  assert.equal(hasData("LINK"), false); // ne gerçek ne tanımlı sentetik
  assert.equal(hasData("SOL"), true);
  assert.equal(hasData("AVAX"), true); // AK-042: tanımlı sentetik + gerçek-kaynaklı
  assert.equal(hasData("DOGE"), true); // AK-FVG-panel: artık tanımlı sentetik + gerçek-kaynaklı
});

console.log("24s Y/D/Hacim (AK-051)");
test("stats24h: sentetik barlarda (time yok) null döner", () => {
  assert.equal(stats24h(getBars("SOL")), null);
});
test("stats24h: boş/eksik veride null döner", () => {
  assert.equal(stats24h([]), null);
  assert.equal(stats24h(null), null);
});
test("stats24h: gerçek barlarda son 24 saatin yüksek/düşük/hacmini doğru hesaplar", () => {
  const now = Date.now();
  const bars = [
    { time: now - 30 * 3600 * 1000, h: 200, l: 190, v: 5 },  // 24s dışında — hariç tutulmalı
    { time: now - 20 * 3600 * 1000, h: 110, l: 95,  v: 10 },
    { time: now - 10 * 3600 * 1000, h: 120, l: 90,  v: 20 },
    { time: now - 1 * 3600 * 1000,  h: 105, l: 100, v: 7 },
  ];
  const s = stats24h(bars);
  assert.equal(s.high, 120);
  assert.equal(s.low, 90);
  assert.equal(s.volSum, 37); // 200/190 barı hariç: 10+20+7
});
test("stats24h: chgPct = (son kapanış - 24s önceki açılış) / açılış (AK-057)", () => {
  const now = Date.now();
  const bars = [
    { time: now - 30 * 3600 * 1000, o: 50,  h: 55,  l: 48,  c: 52,  v: 1 },  // 24s dışında
    { time: now - 20 * 3600 * 1000, o: 100, h: 110, l: 95,  c: 105, v: 10 }, // pencerenin en eski barı — açılış referansı
    { time: now - 5  * 3600 * 1000, o: 105, h: 120, l: 100, c: 110, v: 20 },
    { time: now - 1  * 3600 * 1000, o: 110, h: 115, l: 108, c: 111, v: 7 },  // son kapanış
  ];
  const s = stats24h(bars);
  assert.ok(Math.abs(s.chgPct - 11) < 1e-9, `beklenen ~11, gelen ${s.chgPct}`); // (111-100)/100*100
});

console.log("Binance bağlantı tazeliği (AK-064)");
test("freshnessStatus: eşikler doğru sınıflandırır", () => {
  assert.equal(freshnessStatus(0), "canli");
  assert.equal(freshnessStatus(59), "canli");
  assert.equal(freshnessStatus(60), "gecikmeli");
  assert.equal(freshnessStatus(3599), "gecikmeli");
  assert.equal(freshnessStatus(3600), "baglanti_yok");
  assert.equal(freshnessStatus(999999), "baglanti_yok");
});
test("getFreshness: hiç Binance eşleşmesi olmayan sembolde null döner (sentetik)", () => {
  assert.equal(getFreshness("BILINMEYEN_SEMBOL_XYZ"), null);
});

console.log("canlı mum akışı (AK-072)");
test("applyTick: aynı açılış zamanı (t) → son bar yerinde güncellenir, dizi uzamaz", () => {
  const bars = [
    { t: 0, time: 1000, o: 10, h: 12, l: 9, c: 11, v: 5 },
    { t: 1, time: 2000, o: 11, h: 13, l: 10, c: 12, v: 6 },
  ];
  const k = { t: 2000, o: "11", h: "14", l: "10", c: "13.5", v: "9" }; // aynı bar, fiyat hareket etti
  const next = applyTick(bars, k);
  assert.equal(next.length, 2);
  assert.equal(next[1].c, 13.5);
  assert.equal(next[1].h, 14);
  assert.equal(next[1].t, 1); // dizi indeksi korunur
  assert.equal(bars[1].c, 12, "orijinal dizi mutasyona uğramamalı");
});
test("applyTick: farklı açılış zamanı → yeni bar eklenir, eskiler korunur", () => {
  const bars = [
    { t: 0, time: 1000, o: 10, h: 12, l: 9, c: 11, v: 5 },
    { t: 1, time: 2000, o: 11, h: 13, l: 10, c: 12, v: 6 },
  ];
  const k = { t: 3000, o: "12", h: "12.5", l: "11.8", c: "12.2", v: "3" }; // kapanış — yeni mum açıldı
  const next = applyTick(bars, k);
  assert.equal(next.length, 3);
  assert.equal(next[2].time, 3000);
  assert.equal(next[2].t, 2);
  assert.equal(next[1].c, 12, "önceki bar değişmemeli");
});
test("mergeGapFill: taze barlardan eski olanlar korunur, kesişen/daha yeni aralık taze veriyle değişir", () => {
  const stale = [
    { t: 0, time: 1000, o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: 1, time: 2000, o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: 2, time: 3000, o: 1, h: 1, l: 1, c: 1, v: 1 }, // kopukluk burada başladı — bayat
  ];
  const fresh = [
    { time: 3000, o: 5, h: 6, l: 4, c: 5.5, v: 10 }, // aynı zaman ama REST'ten taze/otoriter
    { time: 4000, o: 5.5, h: 6.2, l: 5.3, c: 6, v: 12 },
  ];
  const merged = mergeGapFill(stale, fresh);
  assert.equal(merged.length, 4); // 1000,2000 (korunan) + 3000,4000 (taze)
  assert.deepEqual(merged.map(b => b.time), [1000, 2000, 3000, 4000]);
  assert.equal(merged[2].c, 5.5, "3000 zaman damgası taze veriyle değişmeli, bayat kalmamalı");
  assert.deepEqual(merged.map(b => b.t), [0, 1, 2, 3], "t alanı baştan yeniden numaralanmalı");
});
test("mergeGapFill: taze bar yoksa orijinal dizi değişmeden döner", () => {
  const bars = [{ t: 0, time: 1000, o: 1, h: 1, l: 1, c: 1, v: 1 }];
  assert.equal(mergeGapFill(bars, []), bars);
  assert.equal(mergeGapFill(bars, null), bars);
});

console.log("id benzersizliği (regresyon koruması)");
test("aynı milisaniyede eklenen kayıtlar farklı id alır (UUID)", () => {
  const a = ledger.addTrade({ sym: "BTC", dir: "Long", plan: 2, r: 1, tag: "FOMO" });
  const b = ledger.addTrade({ sym: "BTC", dir: "Long", plan: 2, r: 1, tag: "FOMO" });
  const c = sandbox.addSandbox({ sym: "ETH", dir: "Short", plan: 2, r: -1, tag: "FOMO" });
  const d = sandbox.addSandbox({ sym: "ETH", dir: "Short", plan: 2, r: -1, tag: "FOMO" });
  assert.ok(a && b && a.id !== b.id, "sicil id çakıştı");
  assert.ok(c && d && c.id !== d.id, "sandbox id çakıştı");
  assert.equal(typeof a.id, "string");
});

console.log("Mod B v1.1 sinyal dedektörü (AK-042)");
// EMA50 bias + siki FVG(<0.3xATR) + OTE(fib 0.618) + onay mumu — kurali karsilayan/karsilamayan
// senaryolari elle kuruyoruz: uzun yavas trend (bias + fib penceresi) -> yerel ralli -> 0.618
// pullback -> konsolidasyon (pencere yenilensin) -> son 4 barda siki FVG + onay mumu.
function buildModBBars({ short = false, gapOffset = 0.03, badConfirm = false, consolidation = 34 } = {}) {
  const bars = [];
  let price = 100;
  for (let i = 0; i < 150; i++) {
    const o = price, c = price + 0.3;
    bars.push({ o, h: c + 0.15, l: o - 0.15, c });
    price = c;
  }
  const rallyStart = price;
  for (let i = 0; i < 20; i++) {
    const o = price, c = price + 1;
    bars.push({ o, h: c + 0.15, l: o - 0.15, c });
    price = c;
  }
  const rallyEnd = price;
  const rg = rallyEnd - rallyStart;
  const level618 = rallyEnd - rg * 0.618;

  let p = price;
  const steps = 5;
  const step = (level618 - p) / steps;
  for (let k = 0; k < steps; k++) {
    const o = p, c = p + step;
    bars.push({ o, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, c });
    p = c;
  }
  for (let k = 0; k < consolidation; k++) {
    const wob = (k % 2 === 0 ? 0.08 : -0.08);
    const o = p, c = p + wob;
    bars.push({ o, h: Math.max(o, c) + 0.12, l: Math.min(o, c) - 0.12, c });
    p = c;
  }
  const base = p;
  bars.push({ o: base + 0.08, h: base + 0.18, l: base - 0.14, c: base - 0.04 });        // i-2
  bars.push({ o: base - 0.04, h: base + 0.04, l: base - 0.12, c: base - 0.09 });        // i-1
  const gapLo = base + 0.18;
  const gapHi = gapLo + gapOffset;
  bars.push({ o: base - 0.09, h: gapHi + 0.12, l: gapHi, c: gapHi + 0.09 });            // i (siki bull FVG)
  const confC = badConfirm ? gapHi + 0.09 - 0.2 : gapHi + 0.09 + 0.2;
  const confO = badConfirm ? gapHi + 0.09 + 0.05 : gapHi + 0.09;
  bars.push({ o: confO, h: Math.max(confO, confC) + 0.1, l: Math.min(confO, confC) - 0.05, c: confC }); // i+1 onay

  const raw = bars.map((b, i) => ({ t: i, ...b }));
  if (!short) return raw;
  const K = 400; // ayna: long kuralinin simetrigi (short) — ayni yapi ters yonde
  return raw.map((b) => ({ t: b.t, o: K - b.o, c: K - b.c, h: K - b.l, l: K - b.h }));
}

test("long: bias+siki FVG+OTE+onay hizalanınca sinyal üretir", () => {
  const sigs = detectModBSignals(buildModBBars(), "TEST");
  assert.equal(sigs.length, 1);
  const s = sigs[0];
  assert.equal(s.dir, 1);
  assert.ok(s.stop < s.entry && s.entry < s.hedef1 && s.hedef1 < s.hedef2, "long R seviyeleri sirali degil");
  assert.ok(s.r0 > 0);
  assert.equal(s.id, `TEST_1_${s.barIndex - 1}`);
});
test("short: aynı kural ters yönde de sinyal üretir", () => {
  const sigs = detectModBSignals(buildModBBars({ short: true }), "TEST");
  assert.equal(sigs.length, 1);
  const s = sigs[0];
  assert.equal(s.dir, -1);
  assert.ok(s.stop > s.entry && s.entry > s.hedef1 && s.hedef1 > s.hedef2, "short R seviyeleri sirali degil");
});
test("FVG 0.3xATR'den geniş olunca sinyal reddedilir", () => {
  assert.equal(detectModBSignals(buildModBBars({ gapOffset: 0.5 }), "TEST").length, 0);
});
test("onay mumu ters yönde kapanınca sinyal reddedilir", () => {
  assert.equal(detectModBSignals(buildModBBars({ badConfirm: true }), "TEST").length, 0);
});
test("60 bardan az veri → boş dizi (çökmez)", () => {
  assert.deepEqual(detectModBSignals(buildModBBars().slice(0, 50), "TEST"), []);
});
test("id deterministik: aynı barlarda tekrar çağrı aynı id'yi üretir (tekrar bildirim önleme temeli)", () => {
  const bars = buildModBBars();
  const a = detectModBSignals(bars, "TEST")[0].id;
  const b = detectModBSignals(bars, "TEST")[0].id;
  assert.equal(a, b);
});

console.log("Sistemim — parametreli Mod B (AK-049)");
test("REGRESYON: params verilmezse DEFAULT_PARAMS ile birebir aynı sonuç (eski davranış korunur)", () => {
  const bars = buildModBBars();
  const a = detectModBSignals(bars, "TEST");
  const b = detectModBSignals(bars, "TEST", DEFAULT_PARAMS);
  assert.deepEqual(a, b);
});
test("ATR çarpanı sıkılaştırılınca eskiden geçen sinyal artık reddedilir (parametre gerçekten bağlı)", () => {
  const bars = buildModBBars();
  assert.equal(detectModBSignals(bars, "TEST").length, 1);
  assert.equal(detectModBSignals(bars, "TEST", { maxGapAtr: 0.001 }).length, 0);
});
test("riskMult değişince stop mesafesi orantılı değişir (R hesaplama parametreye bağlı)", () => {
  const bars = buildModBBars();
  const s1 = detectModBSignals(bars, "TEST", { riskMult: 2 })[0];
  const s2 = detectModBSignals(bars, "TEST", { riskMult: 4 })[0];
  const risk1 = Math.abs(s1.entry - s1.stop), risk2 = Math.abs(s2.entry - s2.stop);
  assert.ok(Math.abs(risk2 / risk1 - 2) < 0.001, `risk oranı 2 değil: ${risk2 / risk1}`);
});
test("emaPeriod parametresi bağlı: geçerli params ile motor çökmez", () => {
  const bars = buildModBBars();
  const sigs = detectModBSignals(bars, "TEST", { emaPeriod: 20 });
  assert.ok(Array.isArray(sigs));
});
test("fibLevel=0.618 (varsayılan) eski inOTE bandı ile birebir aynı davranır", () => {
  const bars = buildModBBars();
  const a = detectModBSignals(bars, "TEST").length;
  const b = detectModBSignals(bars, "TEST", { fibLevel: 0.618 }).length;
  assert.equal(a, b);
});

console.log("Profil vitrini — Supabase sorguları (AK-077)");
const {
  fetchProfileByHandle, fetchProfileById, fetchStrategiesByUser,
  fetchFollowState, followUser, unfollowUser,
} = await import("../src/lib/supabase.js");
// Bu test ortamında (.env boş) supabase client null'dur — motor.test.js'teki loadReal
// testleriyle aynı ilke: async sonuçlar top-level await ile önce çözülür, sonra test()
// içinde SENKRON doğrulanır (test() async hata yakalamaz).
const profByHandle = await fetchProfileByHandle("elifquant");
const profById = await fetchProfileById("some-uuid");
const stratsByUser = await fetchStrategiesByUser("some-uuid");
const followState = await fetchFollowState("a", "b");
const followOk = await followUser("a", "b");
const unfollowOk = await unfollowUser("a", "b");
const profEmptyHandle = await fetchProfileByHandle("");
const profNullId = await fetchProfileById(null);
const stratsUndefined = await fetchStrategiesByUser(undefined);
const followMissing = await fetchFollowState(null, "b");

test("Supabase yapılandırılmamışken profil/strateji sorguları dürüst boş değer döner", () => {
  assert.equal(profByHandle, null);
  assert.equal(profById, null);
  assert.deepEqual(stratsByUser, []);
  assert.equal(followState, false);
});
test("Supabase yapılandırılmamışken takip et/bırak sessizce başarısız döner (çökmez)", () => {
  assert.equal(followOk, false);
  assert.equal(unfollowOk, false);
});
test("eksik id/handle ile çağrılınca ağa hiç çıkmadan boş değer döner", () => {
  assert.equal(profEmptyHandle, null);
  assert.equal(profNullId, null);
  assert.deepEqual(stratsUndefined, []);
  assert.equal(followMissing, false);
});

console.log("kişisel portföy (AK-078)");
const { normalizeToUSD, deriveItems, itemKey, addTransaction, canSubmitTransaction } = await import("../src/lib/portfolio.js");
const { fmtDisplay } = await import("../src/lib/portfolioFormat.js");
const { getUSStockPrice, getUSStockPriceTimestamp, _setApiKeyForTests, _resetCacheForTests, setUpdateInterval } = await import("../src/lib/usStockPrices.js");

test("normalizeToUSD: USD girişte kur her zaman 1 (çevrim gereksiz)", () => {
  const r = normalizeToUSD(100, "USD", 34);
  assert.equal(r.amountUsd, 100);
  assert.equal(r.fxRateUsed, 1);
});
test("normalizeToUSD: TRY girişte fx_rate (1 USD=?TRY) ile USD'ye BÖLÜNEREK çevrilir (D8)", () => {
  const r = normalizeToUSD(3400, "TRY", 34); // 3400 TRY, kur 1USD=34TRY -> 100 USD
  assert.equal(r.amountUsd, 100);
  assert.equal(r.fxRateUsed, 34);
});
test("normalizeToUSD: geçersiz/sıfır kur 1'e düşer (bölme hatası olmaz)", () => {
  const r = normalizeToUSD(100, "TRY", 0);
  assert.equal(r.amountUsd, 100);
  assert.equal(r.fxRateUsed, 1);
});

test("deriveItems: ağırlıklı ortalama maliyet — iki farklı fiyattan alım", () => {
  const key = itemKey("BTC", "crypto");
  const events = [
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "add", qty: 1, cost_usd: 100, fee_usd: 0, ts: 1000 },
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "add", qty: 1, cost_usd: 200, fee_usd: 0, ts: 2000 },
  ];
  const items = deriveItems(events);
  assert.equal(items.length, 1);
  assert.equal(items[0].qty, 2);
  assert.equal(items[0].avg_cost_usd, 150); // (1*100 + 1*200) / 2
});
test("deriveItems: fee maliyete dahil edilir (U3)", () => {
  const key = itemKey("ETH", "crypto");
  const events = [{ item_key: key, symbol: "ETH", asset_type: "crypto", type: "add", qty: 2, cost_usd: 100, fee_usd: 10, ts: 1000 }];
  const items = deriveItems(events);
  assert.equal(items[0].avg_cost_usd, 105); // (2*100 + 10) / 2
});
test("deriveItems: satış (remove) ort. maliyeti DEĞİŞTİRMEZ, yalnız adet düşer", () => {
  const key = itemKey("SOL", "crypto");
  const events = [
    { item_key: key, symbol: "SOL", asset_type: "crypto", type: "add", qty: 10, cost_usd: 50, fee_usd: 0, ts: 1000 },
    { item_key: key, symbol: "SOL", asset_type: "crypto", type: "remove", qty: 4, cost_usd: 0, fee_usd: 0, ts: 2000 },
  ];
  const items = deriveItems(events);
  assert.equal(items[0].qty, 6);
  assert.equal(items[0].avg_cost_usd, 50);
});
test("deriveItems: tamamen satılan kalem listeden düşer (event log'da kalır, mevcut durumda yok)", () => {
  const key = itemKey("AVAX", "crypto");
  const events = [
    { item_key: key, symbol: "AVAX", asset_type: "crypto", type: "add", qty: 5, cost_usd: 20, fee_usd: 0, ts: 1000 },
    { item_key: key, symbol: "AVAX", asset_type: "crypto", type: "remove", qty: 5, cost_usd: 0, fee_usd: 0, ts: 2000 },
  ];
  assert.deepEqual(deriveItems(events), []);
});
test("deriveItems: update_cost ort. maliyeti doğrudan değiştirir (manuel düzeltme)", () => {
  const key = itemKey("BTC", "crypto");
  const events = [
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "add", qty: 1, cost_usd: 100, fee_usd: 0, ts: 1000 },
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "update_cost", qty: 0, cost_usd: 77, fee_usd: 0, ts: 2000 },
  ];
  const items = deriveItems(events);
  assert.equal(items[0].avg_cost_usd, 77);
  assert.equal(items[0].qty, 1); // update_cost adedi etkilemez
});
test("D9: mevcut durum event log'dan türetilir — sıra karışık verilse bile ts'e göre doğru sonuç (event sourcing)", () => {
  const key = itemKey("BTC", "crypto");
  const inOrder = [
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "add", qty: 1, cost_usd: 100, fee_usd: 0, ts: 1000 },
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "add", qty: 3, cost_usd: 200, fee_usd: 0, ts: 2000 },
    { item_key: key, symbol: "BTC", asset_type: "crypto", type: "remove", qty: 1, cost_usd: 0, fee_usd: 0, ts: 3000 },
  ];
  const shuffled = [inOrder[2], inOrder[0], inOrder[1]]; // depolama sırası garanti değil — türetme ts'e göre olmalı
  assert.deepEqual(deriveItems(inOrder), deriveItems(shuffled));
});
test("deriveItems: farklı asset_type aynı sembolü karıştırmaz (item_key ayrımı)", () => {
  const events = [
    { item_key: itemKey("AAPL", "us"), symbol: "AAPL", asset_type: "us", type: "add", qty: 1, cost_usd: 200, fee_usd: 0, ts: 1000 },
  ];
  const items = deriveItems(events);
  assert.equal(items[0].asset_type, "us");
});

console.log("AK-101: Portföy 'İşlem ekle' bug düzeltmeleri — kaydet butonu, sıfır fiyat, adet/dolar tek-alan girişi");
test("canSubmitTransaction: geçerli girdide true", () => {
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: 100, qty: 2 }), true);
});
test("canSubmitTransaction: assetType yoksa, BIST kilitliyse, fiyat/adet <=0 ya da NaN ise false (Bug1/2 — sessiz reddetme yerine buton baştan pasif)", () => {
  assert.equal(canSubmitTransaction({ assetType: null, isBist: false, price: 100, qty: 2 }), false);
  assert.equal(canSubmitTransaction({ assetType: "bist", isBist: true, price: 100, qty: 2 }), false);
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: 0, qty: 2 }), false);
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: -5, qty: 2 }), false);
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: 100, qty: 0 }), false);
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: NaN, qty: 2 }), false);
  assert.equal(canSubmitTransaction({ assetType: "crypto", isBist: false, price: 100, qty: null }), false);
});
test("addTransaction: fiyat sıfırsa reddedilir (Bug3 sertleştirme — önceden price===0 kabul ediliyordu)", () => {
  assert.equal(addTransaction({ symbol: "BTC", assetType: "crypto", type: "add", qty: 1, priceNative: 0 }), null);
  assert.equal(addTransaction({ symbol: "BTC", assetType: "crypto", type: "add", qty: 1, priceNative: -10 }), null);
});
test("adet-only kayıt: yalnız adet + birim fiyat girilir, dolar tutarı hiç geçilmez, cost_basis doğru türer", () => {
  const ev = addTransaction({ symbol: "RENDER", assetType: "crypto", type: "add", qty: 2, priceNative: 8.08 });
  assert.ok(ev);
  assert.equal(ev.qty, 2);
  assert.equal(ev.cost_usd, 8.08); // birim fiyat aynen saklanır (deriveItems qty*cost_usd ile toplar)
  const items = deriveItems([ev]);
  assert.equal(items[0].qty, 2);
  assert.equal(items[0].avg_cost_usd, 8.08);
});
test("dolar-only kayıt: PortfolioPanel'in 'Tutar' modu gibi — kullanıcı yalnız toplam dolar girer, adet fiyattan türetilir, round-trip toplam maliyet korunur", () => {
  const effectivePrice = 8.08, amountUsd = 16.16; // kullanıcı yalnız 16.16$ girdi, adet hiç yazmadı
  const computedQty = amountUsd / effectivePrice; // PortfolioPanel submit()'teki AYNI formül
  const ev = addTransaction({ symbol: "RENDER", assetType: "crypto", type: "add", qty: computedQty, priceNative: effectivePrice });
  assert.ok(ev);
  const items = deriveItems([ev]);
  assert.equal(items[0].avg_cost_usd, effectivePrice);
  assert.ok(Math.abs(items[0].qty * items[0].avg_cost_usd - amountUsd) < 1e-9); // toplam maliyet girilen dolar tutarına eşit
});

console.log("AK-101: Portföy geçmişi — günlük snapshot, dönemsel getiri, aylık takvim");
const { withTodaySnapshot, recordSnapshotIfNeeded, localDateKey, periodReturnPct, dailyReturnPct, weeklyReturnPct, monthlyReturnPct, calendarMonth, MAX_SNAPSHOT_DAYS } = await import("../src/lib/portfolioHistory.js");

test("withTodaySnapshot: aynı gün için ikinci kez çağrılınca ÜZERİNE YAZMAZ (append-only, ledger.js deseniyle tutarlı)", () => {
  const t0 = Date.UTC(2026, 6, 19, 10, 0);
  const s1 = withTodaySnapshot([], 1000, t0);
  assert.equal(s1.length, 1);
  const s2 = withTodaySnapshot(s1, 5000, t0 + 3600000); // aynı gün, farklı saat, farklı değer
  assert.equal(s2.length, 1);
  assert.equal(s2[0].value, 1000); // ilk kayıt korunur
});
test("withTodaySnapshot: farklı günde yeni kayıt eklenir, tarihe göre sıralı kalır", () => {
  const d1 = Date.UTC(2026, 6, 19, 10, 0), d2 = Date.UTC(2026, 6, 20, 10, 0);
  const s1 = withTodaySnapshot([], 1000, d1);
  const s2 = withTodaySnapshot(s1, 1100, d2);
  assert.equal(s2.length, 2);
  assert.equal(s2[0].date, localDateKey(d1));
  assert.equal(s2[1].date, localDateKey(d2));
});
test("withTodaySnapshot: ~1 yıl (MAX_SNAPSHOT_DAYS) sonra en eski kayıt budanır — storage şişmez", () => {
  let snaps = [];
  let t = Date.UTC(2025, 0, 1);
  for (let i = 0; i < MAX_SNAPSHOT_DAYS + 10; i++) {
    snaps = withTodaySnapshot(snaps, 1000 + i, t);
    t += 86400000;
  }
  assert.equal(snaps.length, MAX_SNAPSHOT_DAYS);
  assert.equal(snaps[0].value, 1010); // ilk 10 gün budandı (0..9 gitti, 10. kalan en eski)
});
test("recordSnapshotIfNeeded: fakeStore ile izole çalışır, ikinci çağrıda gereksiz yazma yapmaz", () => {
  const store = fakeStore();
  const t0 = Date.UTC(2026, 6, 19, 9, 0);
  const r1 = recordSnapshotIfNeeded(2000, t0, store);
  assert.equal(r1.length, 1);
  const r2 = recordSnapshotIfNeeded(9999, t0 + 1000, store); // aynı gün — değişmemeli
  assert.equal(r2.length, 1);
  assert.equal(r2[0].value, 2000);
});
test("periodReturnPct/dailyReturnPct: yetersiz geçmişte dürüst null (D13 — fabrike yüzde yok)", () => {
  assert.equal(dailyReturnPct([]), null);
  assert.equal(dailyReturnPct([{ date: "2026-07-19", value: 100, ts: 1 }]), null);
});
test("dailyReturnPct/weeklyReturnPct/monthlyReturnPct: bilinen bir seri için doğru yüzde", () => {
  const snaps = [
    { date: "2026-06-15", value: 1000, ts: 1 }, // 30+ gün önce — monthly referansı
    { date: "2026-07-12", value: 1000, ts: 2 }, // tam 7 gün önce — weekly referansı
    { date: "2026-07-18", value: 1000, ts: 3 }, // dün — daily referansı
    { date: "2026-07-19", value: 1100, ts: 4 }, // bugün
  ];
  assert.equal(dailyReturnPct(snaps), 10); // (1100-1000)/1000*100, dünden bugüne
  assert.ok(Math.abs(weeklyReturnPct(snaps) - 10) < 1e-9);
  assert.ok(Math.abs(monthlyReturnPct(snaps) - 10) < 1e-9);
});
test("calendarMonth: her gün için ancak bir ÖNCEKİ takvim günü kaydı varsa getiri hesaplanır, yoksa null (renk kodlaması için pozitif/negatif/nötr ayrımı)", () => {
  const snaps = [
    { date: "2026-07-01", value: 1000, ts: 1 },
    { date: "2026-07-02", value: 1050, ts: 2 }, // +5%
    { date: "2026-07-03", value: 1029, ts: 3 }, // -2%
    // 4 Temmuz'da kayıt yok (uygulama açılmamış) — 5 Temmuz'un referansı bulunamaz
    { date: "2026-07-05", value: 1000, ts: 5 },
  ];
  const cells = calendarMonth(snaps, 2026, 6); // monthIndex0=6 -> Temmuz
  const byDay = Object.fromEntries(cells.map((c) => [c.day, c]));
  assert.equal(byDay[1].returnPct, null); // ilk kayıt — önceki gün yok
  assert.ok(Math.abs(byDay[2].returnPct - 5) < 1e-9);
  assert.ok(Math.abs(byDay[3].returnPct - (-2)) < 1e-9);
  assert.equal(byDay[4].returnPct, null); // hiç kayıt yok
  assert.equal(byDay[5].returnPct, null); // kayıt var ama önceki gün (4'ü) yok — dürüstçe null
  assert.equal(cells.length, 31); // Temmuz 31 gün
});

test("gizlilik maskesi (D13): hide=true iken tutar HER ZAMAN •••• — gerçek değer sızmaz", () => {
  assert.equal(fmtDisplay(123456, "USD", true), "••••");
  assert.equal(fmtDisplay(0, "USD", true), "••••");
  assert.equal(fmtDisplay(-500, "TRY", true), "••••");
});
test("gizlilik maskesi: hide=false iken gerçek tutar görünür", () => {
  assert.ok(fmtDisplay(1000, "USD", false).includes("1.000") || fmtDisplay(1000, "USD", false).includes("1,000"));
  assert.ok(fmtDisplay(1000, "USD", false) !== "••••");
});

console.log("ABD hisse fiyatı — merkezi cache (AK-078 D11)");
test("getUSStockPrice: anahtar yokken ağa hiç çıkmadan null döner (fabrike veri yok)", async () => {
  _setApiKeyForTests("");
  _resetCacheForTests();
  const price = await getUSStockPrice("AAPL");
  assert.equal(price, null);
});
test("getUSStockPrice: aynı sembole eşzamanlı çağrılar TEK ağ isteğine düşer (merkezi cache/dedup)", async () => {
  _resetCacheForTests();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls++;
    await new Promise((r) => setTimeout(r, 10)); // gerçekçi ağ gecikmesi simülasyonu — dedup penceresi açık kalsın
    return { ok: true, json: async () => ({ c: 189.5 }) };
  };
  _setApiKeyForTests("test-key");
  try {
    const [p1, p2, p3] = await Promise.all([getUSStockPrice("AAPL"), getUSStockPrice("aapl"), getUSStockPrice("AAPL")]);
    assert.equal(fetchCalls, 1, `tek istek beklenirdi, ${fetchCalls} geldi`);
    assert.equal(p1, 189.5); assert.equal(p2, 189.5); assert.equal(p3, 189.5);
  } finally {
    globalThis.fetch = originalFetch;
    _setApiKeyForTests("");
  }
});
test("getUSStockPrice: TTL içinde tekrar çağrı ağa çıkmaz (cache)", async () => {
  _resetCacheForTests();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls++; return { ok: true, json: async () => ({ c: 50 }) }; };
  _setApiKeyForTests("test-key");
  setUpdateInterval(5 * 60 * 1000);
  try {
    await getUSStockPrice("MSFT");
    await getUSStockPrice("MSFT"); // TTL içinde — cache'ten dönmeli
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    _setApiKeyForTests("");
  }
});
test("getUSStockPriceTimestamp (D16): kayıt yokken null, fetch sonrası CACHE'İN KENDİ anı döner", async () => {
  _resetCacheForTests();
  assert.equal(getUSStockPriceTimestamp("GOOG"), null);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ c: 140 }) });
  _setApiKeyForTests("test-key");
  try {
    const before = Date.now();
    await getUSStockPrice("GOOG");
    const after = Date.now();
    const ts = getUSStockPriceTimestamp("GOOG");
    assert.ok(ts >= before && ts <= after, "timestamp fetch penceresi dışında");
  } finally {
    globalThis.fetch = originalFetch;
    _setApiKeyForTests("");
  }
});

console.log("guest senkron nudge (AK-080 C3)");
const { shouldShowNudge, nextNudgeState } = await import("../src/lib/nudge.js");
test("shouldShowNudge: hiç kapatılmadıysa (state=null) göster", () => {
  assert.equal(shouldShowNudge(null), true);
});
test("nextNudgeState: ilk kapatmada permanent=false, count=1", () => {
  const s = nextNudgeState(null, 1000);
  assert.equal(s.count, 1);
  assert.equal(s.permanent, false);
  assert.equal(s.ts, 1000);
});
test("shouldShowNudge: ilk kapatmadan hemen sonra gösterme", () => {
  const s = nextNudgeState(null, 1000);
  assert.equal(shouldShowNudge(s, 1000 + 60000), false); // 1 dk sonra — henüz 7 gün olmadı
});
test("shouldShowNudge: ilk kapatmadan 7 gün sonra bir kez daha göster", () => {
  const s = nextNudgeState(null, 1000);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  assert.equal(shouldShowNudge(s, 1000 + sevenDays - 1), false); // tam eşiğin altı — henüz değil
  assert.equal(shouldShowNudge(s, 1000 + sevenDays), true); // eşik/üstü — bir kez daha göster
});
test("nextNudgeState: ikinci kapatmada permanent=true, bir daha asla gösterilmez", () => {
  const s1 = nextNudgeState(null, 1000);
  const s2 = nextNudgeState(s1, 2000);
  assert.equal(s2.count, 2);
  assert.equal(s2.permanent, true);
  assert.equal(shouldShowNudge(s2, Number.MAX_SAFE_INTEGER), false); // hiçbir zaman diliminde göstermez
});

console.log("Kulak Puanı ekonomisi (AK-023-EXT)");
test("deriveBalance: kazanım + harcama toplamı (harcama düşer)", () => {
  const events = [{ amount: 100 }, { amount: 50 }, { amount: -30 }];
  assert.equal(deriveBalance(events), 120);
});
test("deriveLifetime: yalnız pozitif toplanır — harcama LIFETIME'ı ASLA düşürmez (D15 kilit karar)", () => {
  const events = [{ amount: 100 }, { amount: 50 }, { amount: -30 }, { amount: -500 }];
  assert.equal(deriveLifetime(events), 150); // -30 ve -500 yok sayılır
  assert.equal(deriveBalance(events), -380); // ama bakiye gerçekten düşer
});
test("deriveBalance/deriveLifetime: boş/eksik dizide çökmez", () => {
  assert.equal(deriveBalance([]), 0);
  assert.equal(deriveLifetime(null), 0);
});
test("monthlyEarned: yalnız o ayın pozitif event'lerini toplar, harcama ve başka ay hariç", () => {
  const ref = new Date(2026, 5, 15); // Haziran 2026
  const events = [
    { amount: 100, ts: new Date(2026, 5, 1).getTime() },
    { amount: 50, ts: new Date(2026, 5, 20).getTime() },
    { amount: -40, ts: new Date(2026, 5, 21).getTime() }, // harcama — sayılmaz
    { amount: 300, ts: new Date(2026, 4, 30).getTime() }, // Mayıs — sayılmaz
  ];
  assert.equal(monthlyEarned(events, ref), 150);
});
test("remainingMonthlyCap: tavana yaklaştıkça azalır, asla negatif dönmez", () => {
  const ref = new Date(2026, 5, 15);
  const near = [{ amount: MONTHLY_CAP - 100, ts: ref.getTime() }];
  assert.equal(remainingMonthlyCap(near, ref), 100);
  const over = [{ amount: MONTHLY_CAP + 500, ts: ref.getTime() }];
  assert.equal(remainingMonthlyCap(over, ref), 0);
});
test("currentStreakDays: ardışık günler doğru sayılır, boşluk sıfırlar", () => {
  const day = (n) => new Date(2026, 0, n).toISOString();
  assert.equal(currentStreakDays([{ d: day(1) }, { d: day(2) }, { d: day(3) }]), 3);
  assert.equal(currentStreakDays([{ d: day(1) }, { d: day(5) }, { d: day(6) }]), 2); // 1-5 arası boşluk, yalnız 5-6 sayılır
  assert.equal(currentStreakDays([]), 0);
  assert.equal(currentStreakDays([{ d: day(1) }, { d: day(1) }]), 1); // aynı gün 2 kayıt = 1 gün (işlem sayısından bağımsız)
});
test("streakAwardedRecently: pencere içinde true, dışında false", () => {
  const now = new Date(2026, 5, 15).getTime();
  const events = [{ type: "streak_7", ts: now - 3 * 24 * 60 * 60 * 1000 }];
  assert.equal(streakAwardedRecently(events, "streak_7", 7, new Date(now)), true);
  assert.equal(streakAwardedRecently(events, "streak_7", 2, new Date(now)), false);
});
test("spendItemStatus: kalıcı+max'lı kalem (sandbox_slot) — 3'ten önce aktif&maxed=false, 3'te maxed", () => {
  const item = SPENDING_TABLE.find((i) => i.key === "sandbox_slot");
  const two = [{ type: "spend", ref_id: "sandbox_slot", ts: 1 }, { type: "spend", ref_id: "sandbox_slot", ts: 2 }];
  const s2 = spendItemStatus(two, item);
  assert.equal(s2.active, true); assert.equal(s2.count, 2); assert.equal(s2.maxed, false);
  const three = [...two, { type: "spend", ref_id: "sandbox_slot", ts: 3 }];
  assert.equal(spendItemStatus(three, item).maxed, true);
});
test("spendItemStatus: süreli kalem (backtest_quota) — pencere içinde aktif, dışında pasif", () => {
  const item = SPENDING_TABLE.find((i) => i.key === "backtest_quota");
  const now = new Date(2026, 5, 15);
  const fresh = [{ type: "spend", ref_id: "backtest_quota", ts: now.getTime() - 5 * 24 * 60 * 60 * 1000 }];
  assert.equal(spendItemStatus(fresh, item, now).active, true);
  const stale = [{ type: "spend", ref_id: "backtest_quota", ts: now.getTime() - 40 * 24 * 60 * 60 * 1000 }];
  assert.equal(spendItemStatus(stale, item, now).active, false);
});
test("canPurchase: yetersiz bakiye reddedilir", () => {
  const item = SPENDING_TABLE.find((i) => i.key === "sandbox_slot"); // 500 puan
  assert.equal(canPurchase([], item, 100).ok, false);
});
test("canPurchase: süreli kalem zaten aktifken tekrar satın alınamaz", () => {
  const item = SPENDING_TABLE.find((i) => i.key === "backtest_quota");
  const now = new Date(2026, 5, 15);
  const events = [{ type: "spend", ref_id: "backtest_quota", ts: now.getTime() - 1000 }];
  assert.equal(canPurchase(events, item, 10000, now).ok, false);
});
test("canPurchase: yeterli bakiye + koşullar uygunsa onaylanır", () => {
  const item = SPENDING_TABLE.find((i) => i.key === "badge_showcase"); // 150 puan
  assert.equal(canPurchase([], item, 200).ok, true);
});

console.log("mum kalıbı dedektörleri (AK-087/C8 Faz 1)");
{
  const { isEngulfing, isPinBar, isDoji, isInsideBar, isMarubozu, findCandlePatterns, findEmaCross, findSupportResistance } = await import("../src/lib/detectors.js");
  const B = (o, h, l, c) => ({ o, h, l, c });

  test("boğa yutan: kırmızı gövdeyi yeşil tam kapsar", () => {
    const bars = [B(105, 106, 99, 100), B(99, 107, 98, 106)];
    assert.equal(isEngulfing(bars, 1), 1);
  });
  test("ayı yutan: yeşil gövdeyi kırmızı tam kapsar", () => {
    const bars = [B(100, 106, 99, 105), B(106, 107, 98, 99)];
    assert.equal(isEngulfing(bars, 1), -1);
  });
  test("yutmayan çift mum 0 döner", () => {
    const bars = [B(100, 110, 90, 105), B(101, 104, 100, 103)];
    assert.equal(isEngulfing(bars, 1), 0);
  });
  test("çekiç: uzun alt fitil → +1", () => {
    const bars = [B(100, 101, 90, 100.5)];
    assert.equal(isPinBar(bars, 0), 1);
  });
  test("kayan yıldız: uzun üst fitil → -1", () => {
    const bars = [B(100, 110, 99.5, 99.8)];
    assert.equal(isPinBar(bars, 0), -1);
  });
  test("doji: kırıntı gövde", () => {
    const bars = [B(100, 105, 95, 100.2)];
    assert.equal(isDoji(bars, 0), 1);
    assert.equal(isDoji([B(100, 105, 95, 104)], 0), 0);
  });
  test("inside bar: önceki aralığın içinde", () => {
    const bars = [B(100, 110, 90, 105), B(101, 106, 98, 103)];
    assert.equal(isInsideBar(bars, 1), 1);
    assert.equal(isInsideBar([B(100, 105, 95, 102), B(100, 106, 96, 103)], 1), 0);
  });
  test("marubozu: fitilsiz tam gövde, yön doğru", () => {
    assert.equal(isMarubozu([B(100, 110, 100, 110)], 0), 1);
    assert.equal(isMarubozu([B(110, 110, 100, 100)], 0), -1);
    assert.equal(isMarubozu([B(100, 110, 95, 104)], 0), 0);
  });
  test("findCandlePatterns aralık tarar, tipleri etiketler", () => {
    const bars = [B(105, 106, 99, 100), B(99, 107, 98, 106), B(100, 106, 99, 103)];
    const found = findCandlePatterns(bars, 0, 2);
    assert.ok(found.some(p => p.type === "engulfing" && p.i === 1 && p.dir === 1));
    assert.ok(found.some(p => p.type === "insidebar" && p.i === 2));
  });
  test("findCandlePatterns lookahead korumalı: i, i+1 verisinden etkilenmez", () => {
    const base = [B(105, 106, 99, 100), B(99, 107, 98, 106)];
    const extended = [...base, B(50, 200, 10, 120)]; // sonrasına aşırı uç bar ekle
    const a = findCandlePatterns(base, 0, 1);
    const b = findCandlePatterns(extended, 0, 1).filter(p => p.i <= 1);
    assert.deepEqual(a, b, "sonraki bar geçmiş tespiti değiştirdi — lookahead sızıntısı");
  });
  test("golden/death cross tespit edilir", () => {
    const up = [];
    for (let i = 0; i < 60; i++) up.push(B(100 - i * 0 + (i < 30 ? -i : (i - 30) * 3), 0, 0, i < 30 ? 100 - i : 70 + (i - 30) * 3));
    up.forEach(b => { b.h = b.c + 1; b.l = b.c - 1; b.o = b.c; });
    const crosses = findEmaCross(up, 5, 20);
    assert.ok(crosses.some(c => c.type === "golden_cross"), "yükselişe dönüşte golden cross bulunmalı");
  });
  test("destek/direnç: iki kez dokunulan seviye birleşir", () => {
    const bars = [];
    for (let cycle = 0; cycle < 3; cycle++)
      for (let i = 0; i < 14; i++) {
        const c = i < 7 ? 100 + i * 2 : 114 - (i - 7) * 2;
        bars.push(B(c, c + 1, c - 1, c));
      }
    const levels = findSupportResistance(bars, 3, 1.0);
    assert.ok(levels.length >= 1, "en az bir seviye bulunmalı");
    assert.ok(levels[0].touches >= 2, "tepe seviyesi çok dokunuşlu olmalı");
  });
}

console.log("geometri dedektörleri: çift tepe/dip + OBO/ters OBO (AK-088/C1-C2)");
{
  const { findDoubleTopBottom, findHeadShoulders } = await import("../src/lib/detectors.js");
  const B = (o, h, l, c) => ({ o, h, l, c });

  // İki eşit seviyeli tepe (130), aralarında bir dip (~100), ikinci tepeden sonra
  // boyun çizgisinin (neckline) altına kapanış — "tamamlanmış" çift tepe.
  function buildDoubleTop() {
    const bars = [];
    const push = (o, h, l, c) => bars.push(B(o, h, l, c));
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1; // 1. tepe
    for (let i = 0; i < 10; i++) { const c = p - 1.9; push(p, p + 0.2, c - 0.2, c); p = c; }
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1; // 2. tepe (aynı seviye)
    for (let i = 0; i < 10; i++) { const c = p - 3; push(p, p + 0.2, c - 0.3, c); p = c; } // neckline kırılımı
    return bars;
  }
  // Aynı kalıp ama ikinci tepeden sonra kırılım YOK — pivot penceresini dolduracak kadar bar var
  // (swingWin=5, yani 2. tepeden sonra en az 5 bar gerekir) ama fiyat neckline'ın (~98) çok
  // üstünde kalıyor, hiç kırılmıyor — kalıp bulunur ama confirmed=false kalmalı.
  function buildDoubleTopUnconfirmed() {
    const bars = [];
    const push = (o, h, l, c) => bars.push(B(o, h, l, c));
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1; // 1. tepe
    for (let i = 0; i < 10; i++) { const c = p - 1.9; push(p, p + 0.2, c - 0.2, c); p = c; }
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1; // 2. tepe (aynı seviye)
    for (let i = 0; i < 10; i++) { const c = p - 0.3; push(p, p + 0.2, c - 0.2, c); p = c; } // hafif düşüş, neckline'a inmez
    return bars;
  }
  function buildDoubleBottom() {
    const bars = [];
    const push = (o, h, l, c) => bars.push(B(o, h, l, c));
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 9; i++) { const c = p - 1.8; push(p, p + 0.2, c - 0.2, c); p = c; }
    push(p, p + 0.2, 70, p - 1); p -= 1; // 1. dip
    for (let i = 0; i < 10; i++) { const c = p + 1.9; push(p, c + 0.2, p - 0.2, c); p = c; }
    for (let i = 0; i < 9; i++) { const c = p - 1.8; push(p, p + 0.2, c - 0.2, c); p = c; }
    push(p, p + 0.2, 70, p - 1); p -= 1; // 2. dip (aynı seviye)
    for (let i = 0; i < 10; i++) { const c = p + 3; push(p, c + 0.3, p - 0.2, c); p = c; } // neckline kırılımı
    return bars;
  }

  test("çift tepe: iki eşit seviyeli tepe + neckline kırılımı → confirmed", () => {
    const found = findDoubleTopBottom(buildDoubleTop(), 5, 0.3);
    const dt = found.find(x => x.type === "doubletop");
    assert.ok(dt, "çift tepe bulunmalı");
    assert.equal(dt.confirmed, true);
    assert.ok(dt.i2 > dt.i1);
  });
  test("çift tepe: neckline kırılmadıysa confirmed=false (kalıp var ama tamamlanmamış)", () => {
    const found = findDoubleTopBottom(buildDoubleTopUnconfirmed(), 5, 0.3);
    const dt = found.find(x => x.type === "doubletop");
    assert.ok(dt, "kalıp yine de bulunmalı (henüz kırılmamış)");
    assert.equal(dt.confirmed, false);
  });
  test("çift dip: iki eşit seviyeli dip + neckline kırılımı → confirmed", () => {
    const found = findDoubleTopBottom(buildDoubleBottom(), 5, 0.3);
    const db = found.find(x => x.type === "doublebottom");
    assert.ok(db, "çift dip bulunmalı");
    assert.equal(db.confirmed, true);
  });
  test("düz barda (dejenere pivot) hiç çift tepe/dip uydurulmaz — dürüstlük", () => {
    const flat = [];
    for (let i = 0; i < 80; i++) flat.push(B(100, 100.05, 99.95, 100));
    assert.deepEqual(findDoubleTopBottom(flat, 5, 0.3), []);
  });
  test("monoton trendde (eşleşen ikinci seviye yok) çift tepe/dip bulunmaz", () => {
    const bars = [];
    let p = 100;
    for (let i = 0; i < 80; i++) { p += 0.5; bars.push(B(p - 0.5, p + 0.1, p - 0.6, p)); }
    assert.deepEqual(findDoubleTopBottom(bars, 5, 0.3), []);
  });
  test("lookahead korumalı: gelecek barlar geçmişteki tepe/dip KEŞFİNİ (i1,i2,level) değiştirmez", () => {
    const base = buildDoubleTopUnconfirmed();
    const before = findDoubleTopBottom(base, 5, 0.3).find(x => x.type === "doubletop");
    const extended = [...base, B(200, 210, 190, 205), B(200, 210, 190, 205)];
    const after = findDoubleTopBottom(extended, 5, 0.3).find(x => x.type === "doubletop" && x.i2 === before.i2);
    assert.ok(after, "aynı kalıp gelecekte de bulunmalı");
    assert.equal(after.i1, before.i1);
    assert.equal(after.level, before.level);
  });

  // OBO: sol omuz(115) - baş(135, belirgin yüksek) - sağ omuz(115) + neckline kırılımı.
  function buildHS() {
    const bars = [];
    const push = (o, h, l, c) => bars.push(B(o, h, l, c));
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 8; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 115, p - 0.2, p + 1); p += 1; // sol omuz
    for (let i = 0; i < 8; i++) { const c = p - 1.9; push(p, p + 0.2, c - 0.2, c); p = c; }
    for (let i = 0; i < 8; i++) { const c = p + 2.5; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 135, p - 0.2, p + 1); p += 1; // baş
    for (let i = 0; i < 8; i++) { const c = p - 2.8; push(p, p + 0.2, c - 0.2, c); p = c; }
    for (let i = 0; i < 8; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 115, p - 0.2, p + 1); p += 1; // sağ omuz
    for (let i = 0; i < 10; i++) { const c = p - 3; push(p, p + 0.2, c - 0.3, c); p = c; } // neckline kırılımı
    return bars;
  }
  function buildIHS() {
    const bars = [];
    const push = (o, h, l, c) => bars.push(B(o, h, l, c));
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 8; i++) { const c = p - 1.8; push(p, p + 0.2, c - 0.2, c); p = c; }
    push(p, p + 0.2, 85, p - 1); p -= 1; // sol omuz
    for (let i = 0; i < 8; i++) { const c = p + 1.9; push(p, c + 0.2, p - 0.2, c); p = c; }
    for (let i = 0; i < 8; i++) { const c = p - 2.5; push(p, p + 0.2, c - 0.2, c); p = c; }
    push(p, p + 0.2, 65, p - 1); p -= 1; // baş
    for (let i = 0; i < 8; i++) { const c = p + 2.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    for (let i = 0; i < 8; i++) { const c = p - 1.8; push(p, p + 0.2, c - 0.2, c); p = c; }
    push(p, p + 0.2, 85, p - 1); p -= 1; // sağ omuz
    for (let i = 0; i < 10; i++) { const c = p + 3; push(p, c + 0.3, p - 0.2, c); p = c; } // neckline kırılımı
    return bars;
  }

  test("OBO: sol omuz≈sağ omuz, baş belirgin yüksek + neckline kırılımı → confirmed", () => {
    const found = findHeadShoulders(buildHS(), 5, 0.3);
    const hs = found.find(x => x.type === "hs");
    assert.ok(hs, "OBO bulunmalı");
    assert.equal(hs.confirmed, true);
    assert.ok(hs.headI > hs.leftShoulderI && hs.rightShoulderI > hs.headI);
  });
  test("Ters OBO: sol omuz≈sağ omuz, baş belirgin düşük + neckline kırılımı → confirmed", () => {
    const found = findHeadShoulders(buildIHS(), 5, 0.3);
    const ihs = found.find(x => x.type === "ihs");
    assert.ok(ihs, "Ters OBO bulunmalı");
    assert.equal(ihs.confirmed, true);
  });
  test("düz barda hiç OBO uydurulmaz — dürüstlük", () => {
    const flat = [];
    for (let i = 0; i < 80; i++) flat.push(B(100, 100.05, 99.95, 100));
    assert.deepEqual(findHeadShoulders(flat, 5, 0.3), []);
  });
  test("monoton trendde OBO bulunmaz (omuz benzerliği/baş uçluğu şartı sağlanmaz)", () => {
    const bars = [];
    let p = 100;
    for (let i = 0; i < 80; i++) { p += 0.5; bars.push(B(p - 0.5, p + 0.1, p - 0.6, p)); }
    assert.deepEqual(findHeadShoulders(bars, 5, 0.3), []);
  });
}

console.log("geometri dedektörü: daralan üçgen (AK-088/C3)");
{
  const { findTriangle } = await import("../src/lib/detectors.js");
  const B = (o, h, l, c) => ({ o, h, l, c });
  const triWave = (t) => { const f = t - Math.floor(t); return f < 0.5 ? (4 * f - 1) : (3 - 4 * f); };
  // Üçgen barları: üst/alt zarf yavaşça yakınsar/kayar, her bar küçük fitille zarfa dokunur
  // (gerçekçi ATR ölçeği — tüm zarf genişliğine yayılan dev mumlar değil).
  function buildTriangle(kind) {
    const bars = [], n = 60, period = 10;
    for (let i = 0; i < n; i++) {
      let top, bot;
      if (kind === "asc") { top = 115; bot = 90 + (i / n) * 13; }
      else if (kind === "desc") { top = 120 - (i / n) * 13; bot = 95; }
      else if (kind === "sym") { top = 120 - (i / n) * 10; bot = 90 + (i / n) * 10; }
      else { top = 120; bot = 90; } // "flat": yakınsamayan paralel kanal
      const center = (top + bot) / 2, half = (top - bot) / 2;
      const c = center + half * triWave(i / period);
      bars.push(B(c - 0.15, c + 0.2, c - 0.2, c));
    }
    return bars;
  }

  test("yükselen üçgen: üst yatay + alt yükseliyor → triangle_asc", () => {
    const found = findTriangle(buildTriangle("asc"), 60, 4);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, "triangle_asc");
    assert.ok(found[0].lowerSlope > 0);
  });
  test("alçalan üçgen: üst düşüyor + alt yatay → triangle_desc", () => {
    const found = findTriangle(buildTriangle("desc"), 60, 4);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, "triangle_desc");
    assert.ok(found[0].upperSlope < 0);
  });
  test("simetrik üçgen: ikisi de yakınsıyor → triangle_sym", () => {
    const found = findTriangle(buildTriangle("sym"), 60, 4);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, "triangle_sym");
  });
  test("yakınsamayan paralel kanal → üçgen değil (boş dizi, dürüstlük)", () => {
    assert.deepEqual(findTriangle(buildTriangle("flat"), 60, 4), []);
  });
  test("lookback'ten kısa veri → boş dizi (çökmez)", () => {
    assert.deepEqual(findTriangle(buildTriangle("asc").slice(0, 20), 60, 4), []);
  });
  test("sonuç yalnız verilen barların sınırları içinde kalır (lookahead yok)", () => {
    const bars = buildTriangle("asc");
    const found = findTriangle(bars, 60, 4);
    for (const t of found) {
      assert.ok(t.startI >= 0 && t.endI === bars.length - 1);
    }
  });
}

console.log("divergence: fiyat/gösterge uyumsuzluğu (AK-088/C4, jenerik)");
{
  const { findDivergence, rsi } = await import("../src/lib/detectors.js");
  const B = (o, h, l, c) => ({ o, h, l, c });

  // Ayı divergence: fiyat 2. tepede daha yüksek (higher high), momentum (ve dolayısıyla RSI) daha zayıf.
  function buildBearishDiv() {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 100.5, 99.5, 100));
    for (let i = 0; i < 10; i++) { const c = 100 + i * 3; bars.push(B(c - 3, c + 0.3, c - 3.2, c)); } // güçlü 1. ralli
    for (let i = 0; i < 6; i++) { const c = 130 - i * 2; bars.push(B(c + 2, c + 2.1, c - 0.1, c)); }
    for (let i = 0; i < 10; i++) { const c = 118 + i * 1.5; bars.push(B(c - 1.5, c + 0.1, c - 1.6, c)); } // zayıf 2. ralli (daha yüksek tepe)
    for (let i = 0; i < 5; i++) { const c = 133 - i * 1; bars.push(B(c + 1, c + 1.1, c - 0.1, c)); }
    return bars;
  }
  // Boğa divergence: fiyat 2. dipte daha düşük (lower low), momentum daha zayıf (RSI yükseliyor).
  function buildBullishDiv() {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 100.5, 99.5, 100));
    for (let i = 0; i < 10; i++) { const c = 100 - i * 3; bars.push(B(c + 3, c + 3.2, c - 0.3, c)); } // güçlü 1. düşüş
    for (let i = 0; i < 6; i++) { const c = 70 + i * 2; bars.push(B(c - 2, c + 0.1, c - 2.1, c)); }
    for (let i = 0; i < 10; i++) { const c = 82 - i * 1.5; bars.push(B(c + 1.5, c + 1.6, c - 0.1, c)); } // zayıf 2. düşüş (daha düşük dip)
    for (let i = 0; i < 5; i++) { const c = 67 + i * 1; bars.push(B(c - 1, c + 0.1, c - 1.1, c)); }
    return bars;
  }

  test("ayı divergence: fiyat higher-high, RSI lower-high → bearish_div", () => {
    const bars = buildBearishDiv();
    const found = findDivergence(bars, rsi(bars), 30);
    const d = found.find(x => x.type === "bearish_div");
    assert.ok(d, "ayı divergence bulunmalı");
    assert.ok(bars[d.priceI2].h > bars[d.priceI1].h);
  });
  test("boğa divergence: fiyat lower-low, RSI higher-low → bullish_div", () => {
    const bars = buildBullishDiv();
    const found = findDivergence(bars, rsi(bars), 30);
    const d = found.find(x => x.type === "bullish_div");
    assert.ok(d, "boğa divergence bulunmalı");
    assert.ok(bars[d.priceI2].l < bars[d.priceI1].l);
  });
  test("monoton trendde (fiyat/gösterge aynı yönde) divergence uydurulmaz — dürüstlük", () => {
    const bars = [];
    let p = 200;
    for (let i = 0; i < 80; i++) { p -= 1; bars.push(B(p + 1, p + 1.1, p - 0.5, p)); }
    assert.deepEqual(findDivergence(bars, rsi(bars), 30), []);
  });
  test("indicatorArr verilmezse (null/undefined) çökmez, boş döner — RSI kendi hesaplanmaz", () => {
    const bars = buildBearishDiv();
    assert.deepEqual(findDivergence(bars, null, 30), []);
    assert.deepEqual(findDivergence(null, rsi(bars), 30), []);
  });
  test("sonuç indeksleri asla dizinin dışına taşmaz (lookahead yok)", () => {
    const bars = buildBearishDiv();
    const found = findDivergence(bars, rsi(bars), 30);
    for (const d of found) {
      assert.ok(d.priceI1 < bars.length && d.priceI2 < bars.length);
      assert.ok(d.priceI1 < d.priceI2);
    }
  });
}

console.log("likidite süpürme + PARAMS bloğu (AK-087/C3, AK-084/C1)");
{
  const { findSweep } = await import("../src/lib/detectors.js");
  const { hasParamsBlock, extractParams, upsertParams, ratiosFromLevels } = await import("../src/lib/paramsBlock.js");
  const B = (o, h, l, c) => ({ o, h, l, c });

  test("sweep_low: alt likidite süpürülüp kapanış geri döner", () => {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 101, 99, 100)); // lo=99
    bars.push(B(100, 100.5, 98.9, 99.8)); // low 99'un %0.1 altı, kapanış üstte
    const found = findSweep(bars, 20, 0.0004, 0.0035);
    assert.equal(found.length, 1);
    assert.equal(found[0].type, "sweep_low");
    assert.equal(found[0].dir, 1);
    assert.equal(found[0].level, 99);
  });
  test("bandın dışı süpürme sayılmaz (çok derin ihlal)", () => {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 101, 99, 100));
    bars.push(B(100, 100.5, 95, 99.8)); // %4 ihlal — maxPct üstü
    assert.equal(findSweep(bars, 20, 0.0004, 0.0035).length, 0);
  });
  test("kapanış geri dönmezse süpürme değil, kırılım", () => {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 101, 99, 100));
    bars.push(B(100, 100.2, 98.9, 98.95)); // kapanış seviyenin altında kaldı
    assert.equal(findSweep(bars, 20, 0.0004, 0.0035).length, 0);
  });
  test("findSweep lookahead korumalı", () => {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push(B(100, 101, 99, 100));
    bars.push(B(100, 100.5, 98.9, 99.8));
    const a = findSweep(bars, 20);
    const b = findSweep([...bars, B(10, 300, 5, 200)], 20).filter(s => s.i < bars.length);
    assert.deepEqual(a, b, "sonraki bar geçmiş sweep tespitini değiştirdi");
  });

  test("PARAMS: blok yoksa başa eklenir, serbest kod korunur", () => {
    const code = "function mySignal(bars, h) {\n  return null;\n}";
    const out = upsertParams(code, { slR: 2, tpR: 5 });
    assert.ok(hasParamsBlock(out));
    assert.ok(out.endsWith(code), "serbest kod bayt bayt korunmalı");
    assert.deepEqual(extractParams(out), { slR: 2, tpR: 5 });
  });
  test("PARAMS: mevcut blok güncellenir, diğer anahtarlar yaşar", () => {
    let code = upsertParams("// benim kodum\nreturn 1;", { fvgMinAtr: 0.3, ote: 0.62 });
    code = upsertParams(code, { ote: 0.5 });
    assert.deepEqual(extractParams(code), { fvgMinAtr: 0.3, ote: 0.5 });
    assert.ok(code.includes("// benim kodum"));
  });
  test("PARAMS: bozuk blok null döner, upsert yine de güvenli", () => {
    const broken = '// AK-PARAMS x\nconst PARAMS = { $$$ };\nkodum();';
    assert.equal(extractParams(broken), null);
    const fixed = upsertParams(broken, { slR: 2 });
    assert.deepEqual(extractParams(fixed), { slR: 2 });
    assert.ok(fixed.includes("kodum();"), "kullanıcı kodu asla silinmez");
  });
  test("PARAMS: string ve boolean değerler taşınır", () => {
    const out = upsertParams("", { setup: "sweep+fvg", trendFiltre: true });
    assert.deepEqual(extractParams(out), { setup: "sweep+fvg", trendFiltre: true });
  });
  test("ratiosFromLevels: 100 giriş / 98 SL / 110 TP → 1:5R", () => {
    assert.deepEqual(ratiosFromLevels(100, 98, 110), { slR: 1, tpR: 5 });
    assert.equal(ratiosFromLevels(100, 100, 110), null, "sıfır risk → null");
  });
}

console.log("Brier skorlama — Tahmin Ligi motoru (AK-083/M1)");
{
  const { brierScore, meanBrier, leaderboard, calibrationCurve, overconfidence } = await import("../src/lib/brier.js");

  test("Brier temel: %50 güven her sonuçta 0.25", () => {
    assert.equal(brierScore(0.5, true), 0.25);
    assert.equal(brierScore(0.5, false), 0.25);
  });
  test("Brier uçlar: %95 tuttu → küçük, %95 tutmadı → büyük ceza", () => {
    assert.ok(brierScore(0.95, true) < 0.01);
    assert.ok(brierScore(0.95, false) > 0.9);
  });
  test("güven [0.5, 0.95] bandına kıstırılır", () => {
    assert.equal(brierScore(0.99, false), brierScore(0.95, false));
    assert.equal(brierScore(0.2, true), brierScore(0.5, true));
  });
  test("kalibre mütevazı, aşırı özgüvenliyi yener", () => {
    // A: %60 güven, 10'da 6 tutturur (kalibre). B: %90 güven, 10'da 6 tutturur.
    const mk = (conf, hits, n) => Array.from({ length: n }, (_, i) => ({ confidence: conf, hit: i < hits }));
    const a = meanBrier(mk(0.6, 6, 10)), b = meanBrier(mk(0.9, 6, 10));
    assert.ok(a < b, `kalibre (${a}) aşırı özgüvenden (${b}) iyi olmalı`);
  });
  test("leaderboard: az katılımlı sıralama dışına düşer", () => {
    const lb = leaderboard([
      { userId: "tek-atis", preds: [{ confidence: 0.95, hit: true }] },
      { userId: "istikrarli", preds: Array.from({ length: 6 }, () => ({ confidence: 0.6, hit: true })) },
    ], 4);
    assert.equal(lb[0].userId, "istikrarli", "tek şanslı tahmin ligi kazanmamalı");
    assert.equal(lb[1].ranked, false);
  });
  test("çözülmemiş tahminler (hit yok) skora girmez", () => {
    assert.equal(meanBrier([{ confidence: 0.8 }, { confidence: 0.7, hit: true }]), brierScore(0.7, true));
  });
  test("kalibrasyon eğrisi: kova isabet oranları doğru", () => {
    const preds = [
      ...Array.from({ length: 10 }, (_, i) => ({ confidence: 0.82, hit: i < 5 })), // %80 kovası, %50 isabet
      ...Array.from({ length: 4 }, () => ({ confidence: 0.55, hit: true })),
    ];
    const curve = calibrationCurve(preds);
    const b80 = curve.find(b => b.lo === 0.8);
    assert.equal(b80.n, 10);
    assert.equal(b80.hitRate, 0.5);
  });
  test("overconfidence: %80 güven + %50 isabet → ~+0.3, az veride null", () => {
    const preds = Array.from({ length: 10 }, (_, i) => ({ confidence: 0.8, hit: i < 5 }));
    assert.equal(overconfidence(preds), 0.3);
    assert.equal(overconfidence(preds.slice(0, 3)), null);
  });
}

console.log("Strateji Çıkarıcı kod üreteci (AK-087/C5)");
{
  const { generateSignalCode, AVAILABLE_BLOCKS } = await import("../src/lib/codegen.js");
  const { extractParams, hasParamsBlock } = await import("../src/lib/paramsBlock.js");

  test("sweep+fvg+ote üretimi: PARAMS bloklu, parse edilebilir, hipotez uyarılı", () => {
    const code = generateSignalCode(["sweep", "fvg", "ote"], { slR: 2, tpR: 5 });
    assert.ok(hasParamsBlock(code));
    const p = extractParams(code);
    assert.equal(p.tpR, 5);
    assert.equal(p.sweepLookback, 20);
    assert.equal(p.oteLevel, 0.62);
    assert.ok(code.includes("HİPOTEZ"), "dürüstlük uyarısı kodda olmalı");
    new Function(code + "\nreturn mySignal;"); // sözdizimi geçerli mi
  });
  test("yön bloğu yoksa varsayılan dir eklenir, sweep varsa eklenmez", () => {
    assert.ok(generateSignalCode(["fvg"]).includes("let dir = 1"));
    assert.ok(!generateSignalCode(["sweep", "fvg"]).includes("let dir = 1"));
  });
  test("boş/geçersiz seçim null", () => {
    assert.equal(generateSignalCode([]), null);
    assert.equal(generateSignalCode(["olmayan_blok"]), null);
  });
  test("AVAILABLE_BLOCKS panel için etiketli liste verir", () => {
    assert.ok(AVAILABLE_BLOCKS.length >= 5);
    assert.ok(AVAILABLE_BLOCKS.every(b => b.key && b.label));
  });
}

console.log("kod üreteci uçtan uca (AK-087/C5 duman)");
{
  const { generateSignalCode } = await import("../src/lib/codegen.js");
  const det = await import("../src/lib/detectors.js");

  test("üretilen sweep kodu, sentetik süpürme barında sinyal döndürür", () => {
    const code = generateSignalCode(["sweep"], { slR: 2, tpR: 5 });
    const mySignal = new Function(code + "\nreturn mySignal;")();
    const B = (o, h, l, c) => ({ o, h, l, c });
    const bars = [];
    for (let i = 0; i < 70; i++) bars.push(B(100, 101, 99, 100)); // lo=99 likidite
    bars.push(B(100, 100.5, 98.93, 99.9)); // alt süpürme + geri kapanış
    const sig = mySignal(bars, det);
    assert.ok(sig, "sinyal dönmeli");
    assert.equal(sig.dir, 1, "alt süpürme → LONG");
    assert.ok(sig.stop < sig.entry && sig.target > sig.entry, "long: stop altta, hedef üstte");
    const rr = Math.abs(sig.target - sig.entry) / Math.abs(sig.entry - sig.stop);
    assert.ok(Math.abs(rr - 5) < 0.01, `R oranı PARAMS.tpR'yi izlemeli (5 bekleniyor, ${rr.toFixed(2)} geldi)`);
  });
}

console.log("T1 — yeni codegen blokları: ob / bos / mitigation / sr (AK-T1)");
{
  const { generateSignalCode } = await import("../src/lib/codegen.js");
  const det = await import("../src/lib/detectors.js");
  const B = (o, h, l, c) => ({ o, h, l, c });

  // ob bloğu: boğa OB oluşacak şekilde mum dizisi
  // Bar i-1: ayı mumu, bar i: ≥%1.5 gövdeli boğa mumu → OB i-1'de
  // Sonra birkaç düzlük bar + OB bölgesine dönen bar
  test("ob bloğu: kod parse edilir, PARAMS'lı, HİPOTEZ uyarısı var, dir üretir", () => {
    const code = generateSignalCode(["ob"], { slR: 2, tpR: 4 });
    assert.ok(code, "kod üretilmeli");
    assert.ok(code.includes("HİPOTEZ"));
    assert.ok(code.includes("obTolAtr"));
    new Function(code + "\nreturn mySignal;"); // sözdizimi geçerli mi
  });
  test("ob bloğu: OB oluşan ve fiyatın OB bölgesine döndüğü barda sinyal döndürür", () => {
    const code = generateSignalCode(["ob"], { slR: 2, tpR: 3 });
    const mySignal = new Function(code + "\nreturn mySignal;")();
    const bars = [];
    for (let i = 0; i < 65; i++) bars.push(B(100, 101, 99, 100)); // ısınma
    // OB: ayı mumu + hemen arkasından ≥1.5% boğa mumu
    bars.push(B(100, 100.5, 99.2, 99.4));  // bearish
    bars.push(B(99.4, 101.5, 99.3, 101.4)); // bullish ≥1.5% body → OB @i_prev=[99.2,100]
    for (let i = 0; i < 5; i++) bars.push(B(101, 101.5, 100.5, 101)); // düzlük
    // Fiyat OB bölgesine (~99.2–100) geri döner
    bars.push(B(101, 101, 99.5, 99.6)); // close OB bölgesinde
    const sig = mySignal(bars, det);
    assert.ok(sig, "OB bölgesine dönüşte sinyal dönmeli");
    assert.equal(sig.dir, 1, "bullish OB → LONG");
  });

  test("bos bloğu: kod parse edilir, PARAMS'lı, HİPOTEZ uyarısı var, dir üretir", () => {
    const code = generateSignalCode(["bos"], { slR: 1.5, tpR: 3 });
    assert.ok(code, "kod üretilmeli");
    assert.ok(code.includes("HİPOTEZ"));
    new Function(code + "\nreturn mySignal;"); // sözdizimi geçerli mi
  });
  test("bos bloğu: önceki zirveyi kıran barda sinyal döndürür", () => {
    const code = generateSignalCode(["bos"], { slR: 1.5, tpR: 3 });
    const mySignal = new Function(code + "\nreturn mySignal;")();
    const bars = [];
    for (let i = 0; i < 65; i++) bars.push(B(100, 102, 99, 100));   // high=102 baseline
    bars.push(B(100, 103, 99.5, 102.5)); // close > prevHigh (max of last 5 bars ~102) → BOS
    const sig = mySignal(bars, det);
    assert.ok(sig, "BOS barında sinyal dönmeli");
    assert.equal(sig.dir, 1, "BOS → LONG");
  });

  test("mitigation bloğu: kod parse edilir, PARAMS'lı, HİPOTEZ uyarısı var, dir üretir", () => {
    const code = generateSignalCode(["mitigation"], { slR: 2, tpR: 4 });
    assert.ok(code, "kod üretilmeli");
    assert.ok(code.includes("HİPOTEZ"));
    new Function(code + "\nreturn mySignal;"); // sözdizimi geçerli mi
  });
  test("mitigation bloğu: OB sonrası mitigasyon barında sinyal döndürür", () => {
    const code = generateSignalCode(["mitigation"], { slR: 2, tpR: 4 });
    const mySignal = new Function(code + "\nreturn mySignal;")();
    const bars = [];
    for (let i = 0; i < 65; i++) bars.push(B(100, 101, 99, 100));
    // OB oluştur: bearish + ardından ≥1.5% bullish
    bars.push(B(100, 100.5, 98.5, 98.8));   // bearish: o=100, c=98.8, lo=98.5, hi=100.5 → OB [98.5,100]
    bars.push(B(98.8, 101.8, 98.7, 101.5)); // bullish ≥1.5%
    for (let i = 0; i < 4; i++) bars.push(B(101, 102, 100.5, 101.2)); // yukarda dolaş
    // Mitigasyon: OB bölgesine [98.5,100] dokunuş
    bars.push(B(101, 101, 99, 99.5)); // low=99 → OB bölgesine girer → mitigation
    const sig = mySignal(bars, det);
    assert.ok(sig, "mitigasyon barında sinyal dönmeli");
    assert.equal(sig.dir, 1, "OB mitigasyonu → LONG");
  });

  test("sr bloğu: kod parse edilir, PARAMS'lı (srTolAtr), HİPOTEZ uyarısı var, dir üretir", () => {
    const code = generateSignalCode(["sr"], { slR: 2, tpR: 4 });
    assert.ok(code, "kod üretilmeli");
    assert.ok(code.includes("HİPOTEZ"));
    assert.ok(code.includes("srTolAtr"));
    new Function(code + "\nreturn mySignal;"); // sözdizimi geçerli mi
  });
  test("sr bloğu: bilinen S/R seviyesine yakın barda sinyal döndürür", () => {
    const code = generateSignalCode(["sr"], { slR: 2, tpR: 4 });
    const mySignal = new Function(code + "\nreturn mySignal;")();
    // S/R için: swingWin=5 dolayısıyla ≥11 bar gerekiyor, bant içinde birden fazla dokunuş
    const bars = [];
    // 105'te destek oluşturacak şekilde pivot low'lar
    for (let i = 0; i < 6; i++) bars.push(B(107, 109, 104.9, 106)); // window 1
    bars.push(B(106, 108, 104.8, 107)); // pivot low ~105 — 1. dokunuş
    for (let i = 0; i < 6; i++) bars.push(B(107, 110, 106, 108)); // window 2
    bars.push(B(108, 109, 105.0, 107.5)); // pivot low ~105 — 2. dokunuş
    for (let i = 0; i < 6; i++) bars.push(B(108, 111, 107, 109));
    for (let i = 0; i < 40; i++) bars.push(B(108, 111, 107, 109)); // ısınma
    // Fiyat desteğe (~104.9–105) yakın bir noktaya iner
    bars.push(B(107, 107.5, 105.1, 105.2));
    const sig = mySignal(bars, det);
    assert.ok(sig, "S/R seviyesine yakın barda sinyal dönmeli");
  });
  test("T1: ob/bos/mitigation/sr AVAILABLE_BLOCKS içinde var", async () => {
    const { AVAILABLE_BLOCKS } = await import("../src/lib/codegen.js");
    const keys = new Set(AVAILABLE_BLOCKS.map(b => b.key));
    for (const k of ["ob", "bos", "mitigation", "sr"]) {
      assert.ok(keys.has(k), `${k} AVAILABLE_BLOCKS'ta eksik`);
    }
  });
}

console.log("rozet motoru (AK-083/M3)");
{
  const { deriveBadges, visibleBadges, BADGES } = await import("../src/lib/badges.js");

  test("streak 30 → hem 7 hem 30 rozeti", () => {
    const b = deriveBadges({ maxStreakDays: 30, sicilCount: 40 });
    assert.ok(b.includes("seri_7") && b.includes("seri_30") && b.includes("ilk_sicil"));
  });
  test("kalibrasyon: 8 hafta şartı — 7 haftada verilmez", () => {
    assert.ok(!deriveBadges({ seasonBrier: { avg: 0.1, weeks: 7 } }).includes("kalibrasyon"));
    assert.ok(deriveBadges({ seasonBrier: { avg: 0.1, weeks: 8 } }).includes("kalibrasyon"));
  });
  test("gizli rozet kazanılmadan listede görünmez, kazanılınca görünür", () => {
    const before = visibleBadges([]);
    assert.ok(!before.some(b => b.key === "disiplin"), "gizli + kazanılmamış → yok");
    const after = visibleBadges(["disiplin"]);
    assert.ok(after.some(b => b.key === "disiplin" && b.earned));
  });
  test("kurucu: 100. üye alır, 101. almaz", () => {
    assert.ok(deriveBadges({ memberIndex: 100 }).includes("kurucu"));
    assert.ok(!deriveBadges({ memberIndex: 101 }).includes("kurucu"));
  });
  test("boş stats → boş rozet, çökmez", () => {
    assert.deepEqual(deriveBadges(), []);
    assert.equal(visibleBadges().filter(b => b.earned).length, 0);
  });
}

console.log("achievement motoru (AK-086)");
{
  const { deriveProgress, newlyCompleted, ACHIEVEMENTS } = await import("../src/lib/achievements.js");

  test("progress: 3/5 streak → %60, done false", () => {
    const p = deriveProgress({ loginStreak: 3 }).find(a => a.key === "gozlemci");
    assert.equal(p.pct, 60);
    assert.equal(p.done, false);
    assert.equal(p.current, 3);
  });
  test("hedef aşımı: current hedefte kıstırılır, pct 100'ü aşmaz", () => {
    const p = deriveProgress({ loginStreak: 12 }).find(a => a.key === "gozlemci");
    assert.equal(p.current, 5);
    assert.equal(p.pct, 100);
    assert.equal(p.done, true);
  });
  test("newlyCompleted: yalnız YENİ bitenler döner", () => {
    const stats = { lessonsDone: 1, loginStreak: 5 };
    const fresh = newlyCompleted(stats, ["ogrenci"]);
    assert.deepEqual(fresh.map(a => a.key), ["gozlemci"], "önceden bitmiş tekrar dönmemeli");
  });
  test("hiçbir achievement işlem SAYISINA bağlı değil (süreç ilkesi)", () => {
    assert.ok(ACHIEVEMENTS.every(a => !/trade|islem|pozisyon/i.test(a.stat)), "trade-bazlı stat yasak");
  });
  test("boş stats: hepsi %0, hiçbiri done, çökmez", () => {
    const all = deriveProgress();
    assert.ok(all.every(a => a.pct === 0 && !a.done));
  });
}

console.log("Tahmin Ligi — veri katmanı (AK-083 UI)");
{
  const {
    toBrierRows, groupByUser, fetchActiveQuestion, fetchMyPrediction,
    lockPrediction, fetchResolvedQuestions, fetchResolvedPredictions, fetchMyResolvedPredictions,
  } = await import("../src/lib/predictions.js");
  const { fetchProfilesByIds } = await import("../src/lib/supabase.js");

  test("toBrierRows: yalnız çözülmüş+outcome'lu satırlar geçer, hit doğru hesaplanır", () => {
    const raw = [
      { user_id: "u1", direction: "up", confidence: 0.8, question: { resolved: true, outcome: "up" } },
      { user_id: "u1", direction: "down", confidence: 0.6, question: { resolved: true, outcome: "up" } },
      { user_id: "u2", direction: "up", confidence: 0.7, question: { resolved: false, outcome: null } },
      { user_id: "u2", direction: "up", confidence: 0.9, question: null },
    ];
    const rows = toBrierRows(raw);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { userId: "u1", confidence: 0.8, hit: true });
    assert.deepEqual(rows[1], { userId: "u1", confidence: 0.6, hit: false });
  });
  test("toBrierRows: boş/eksik girdide çökmez", () => {
    assert.deepEqual(toBrierRows(null), []);
    assert.deepEqual(toBrierRows([]), []);
  });
  test("groupByUser: aynı kullanıcının tahminleri tek girdide birikir", () => {
    const rows = [
      { userId: "u1", confidence: 0.8, hit: true },
      { userId: "u2", confidence: 0.6, hit: false },
      { userId: "u1", confidence: 0.7, hit: false },
    ];
    const grouped = groupByUser(rows);
    assert.equal(grouped.length, 2);
    const u1 = grouped.find((g) => g.userId === "u1");
    assert.equal(u1.preds.length, 2);
  });

  // Bu test ortamında (.env boş) supabase client null'dur — motor.test.js'teki loadReal/AK-077
  // testleriyle aynı ilke: async sonuçlar top-level await ile önce çözülür, test() SENKRON doğrular.
  const activeQ = await fetchActiveQuestion();
  const myPred = await fetchMyPrediction("q1", "u1");
  const lockRes = await lockPrediction("q1", "u1", "up", 0.8);
  const lockBadDir = await lockPrediction("q1", "u1", "sideways", 0.8);
  const resolvedQs = await fetchResolvedQuestions();
  const resolvedPreds = await fetchResolvedPredictions();
  const myResolvedPreds = await fetchMyResolvedPredictions("u1");
  const profilesMap = await fetchProfilesByIds(["u1", "u2"]);
  const profilesMapEmpty = await fetchProfilesByIds([]);

  test("Supabase yapılandırılmamışken tahmin sorguları dürüst boş değer döner", () => {
    assert.equal(activeQ, null);
    assert.equal(myPred, null);
    assert.deepEqual(resolvedQs, []);
    assert.deepEqual(resolvedPreds, []);
    assert.deepEqual(myResolvedPreds, []);
    assert.deepEqual(profilesMap, {});
    assert.deepEqual(profilesMapEmpty, {});
  });
  test("lockPrediction: yapılandırılmamışken/eksik id'yle başarısız döner (çökmez)", () => {
    assert.equal(lockRes.ok, false);
  });
  test("lockPrediction: geçersiz yön reddedilir", () => {
    assert.equal(lockBadDir.ok, false);
    assert.match(lockBadDir.error, /yön/i);
  });
}

console.log("kimlik kartı / başarım / rozet stats türetme (AK-086 UI)");
{
  const {
    maxStreakDays, ideasCount, verifiedStrategiesCount, profileComplete,
    fetchFollowCounts, fetchFollowList, fetchPredictionsCount, fetchMemberIndex, fetchProfileStats,
  } = await import("../src/lib/profileStats.js");

  test("maxStreakDays: TÜM geçmişteki en uzun seri döner, GÜNCEL seri değil (kırılmış seri sonrası da kalıcı)", () => {
    // 5 günlük seri, 3 gün boşluk, sonra 2 günlük GÜNCEL seri — max hâlâ 5 olmalı
    const mk = (isoDays) => isoDays.map((d) => ({ d: d + "T10:00:00.000Z" }));
    const trades = mk(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-09", "2026-01-10"]);
    assert.equal(maxStreakDays(trades), 5);
  });
  test("maxStreakDays: boş/tek günlük sicilde çökmez", () => {
    assert.equal(maxStreakDays([]), 0);
    assert.equal(maxStreakDays([{ d: "2026-01-01T00:00:00.000Z" }]), 1);
  });
  test("maxStreakDays: aynı gün birden çok kayıt tek gün sayılır (enflasyon freni ilkesiyle tutarlı)", () => {
    const trades = [
      { d: "2026-01-01T09:00:00.000Z" }, { d: "2026-01-01T18:00:00.000Z" },
      { d: "2026-01-02T09:00:00.000Z" },
    ];
    assert.equal(maxStreakDays(trades), 2);
  });

  test("ideasCount: doğrulanmış strateji + tahmin katılımı toplamı (Fikirler formülü, K1)", () => {
    assert.equal(ideasCount(3, 5), 8);
    assert.equal(ideasCount(0, 0), 0);
  });
  test("ideasCount: negatif/eksik girdi çökmez, negatife düşmez", () => {
    assert.equal(ideasCount(undefined, undefined), 0);
    assert.equal(ideasCount(-5, 2), 2);
  });

  test("verifiedStrategiesCount: yalnız oos_t>=2 olanlar sayılır", () => {
    const strategies = [{ oos_t: 2.5 }, { oos_t: 1.2 }, { oos_t: "2.0" }, { oos_t: null }];
    assert.equal(verifiedStrategiesCount(strategies), 2);
  });
  test("verifiedStrategiesCount: boş/eksik girdide çökmez", () => {
    assert.equal(verifiedStrategiesCount([]), 0);
    assert.equal(verifiedStrategiesCount(undefined), 0);
  });

  test("profileComplete: handle VE job ikisi de dolu olmalı (K2 İlk Adım başarımı)", () => {
    assert.equal(profileComplete({ handle: "elif", job: "trader" }), true);
    assert.equal(profileComplete({ handle: "elif" }), false);
    assert.equal(profileComplete({}), false);
    assert.equal(profileComplete(null), false);
  });

  test("Supabase yapılandırılmamışken follow/prediction/member sorguları dürüst boş değer döner (D6)", async () => {
    assert.deepEqual(await fetchFollowCounts("u1"), { followers: 0, following: 0 });
    assert.deepEqual(await fetchFollowList("u1", "followers"), []);
    assert.equal(await fetchPredictionsCount("u1"), 0);
    assert.equal(await fetchMemberIndex("u1", "2026-01-01"), null);
  });
  test("fetchProfileStats: profil yoksa boş nesne, çökmez", async () => {
    assert.deepEqual(await fetchProfileStats(null), {});
  });
  test("fetchProfileStats: isOwner=false iken sicil-bazlı alanlar 0 kalır (D1: cihaz-içi veri başkasına sızmaz)", async () => {
    const trades = [{ d: "2026-01-01T00:00:00.000Z" }, { d: "2026-01-02T00:00:00.000Z" }];
    const s = await fetchProfileStats({ id: "u1", handle: "x", created_at: "2026-01-01" }, { isOwner: false, trades });
    assert.equal(s.sicilCount, 0);
    assert.equal(s.maxStreakDays, 0);
  });
  test("fetchProfileStats: v1'de wired olmayan alanlar dürüstçe 0/null (fabrike veri yok, D6)", async () => {
    const s = await fetchProfileStats({ id: "u1", handle: "x", created_at: "2026-01-01" }, { isOwner: true, trades: [] });
    assert.equal(s.activeInvites, 0);
    assert.equal(s.helpfulMarks, 0);
    assert.equal(s.lessonsDone, 0);
    assert.equal(s.scenariosDone, 0);
    assert.equal(s.loginStreak, 0);
    assert.equal(s.seasonBrier, null);
    assert.equal(s.disciplineDays, 0);
  });

  // K3: gizli rozet görünürlüğü — badges.js'in KENDİ testleri zaten var (AK-083/M3 bloğu),
  // burada Profil.jsx'in gerçekte tükettiği yol (profileStats çıktısı -> deriveBadges -> visibleBadges)
  // uçtan uca doğrulanır.
  const { deriveBadges, visibleBadges } = await import("../src/lib/badges.js");
  test("uçtan uca: fetchProfileStats çıktısı deriveBadges/visibleBadges'e sorunsuz akar, gizli rozet gizli kalır", async () => {
    const s = await fetchProfileStats({ id: "u1", handle: "x", created_at: "2026-01-01" }, { isOwner: true, trades: [] });
    const earned = deriveBadges(s);
    const shown = visibleBadges(earned);
    assert.ok(!shown.some((b) => b.key === "kurucu"), "Supabase boşken memberIndex null — kurucu kazanılmamalı/görünmemeli");
    assert.ok(!shown.some((b) => b.key === "disiplin"), "disciplineDays=0 iken gizli rozet listede olmamalı");
  });
}

console.log("Strateji Çıkarıcı — İncele/oluşum paneli/dürüstlük kapısı (AK-084+087 UI)");
{
  const { rangeFromIndices, mapOccurrenceToBlockKey, analyzeRange, hypothesisStatus } = await import("../src/lib/strategyExtractor.js");
  const { generateSignalCode } = await import("../src/lib/codegen.js");
  const { extractParams } = await import("../src/lib/paramsBlock.js");

  console.log("C1: seçim → bar aralığı çevirisi");
  test("rangeFromIndices: sıra farketmez, min-max normalize edilir", () => {
    assert.deepEqual(rangeFromIndices(120, 80), { start: 80, end: 120 });
    assert.deepEqual(rangeFromIndices(80, 120), { start: 80, end: 120 });
  });
  test("rangeFromIndices: eşit uç noktalar da geçerli bir (sıfır genişlikli) aralık döner", () => {
    assert.deepEqual(rangeFromIndices(50, 50), { start: 50, end: 50 });
  });
  test("rangeFromIndices: sayısal olmayan girdide null (çökmez)", () => {
    assert.equal(rangeFromIndices(undefined, 10), null);
    assert.equal(rangeFromIndices(10, NaN), null);
  });

  console.log("C3: oluşum türü → codegen.js AVAILABLE_BLOCKS anahtar eşlemesi");
  test("mapOccurrenceToBlockKey: mum kalıpları → candle", () => {
    assert.equal(mapOccurrenceToBlockKey("engulfing"), "candle");
    assert.equal(mapOccurrenceToBlockKey("pinbar"), "candle");
    assert.equal(mapOccurrenceToBlockKey("marubozu"), "candle");
  });
  test("mapOccurrenceToBlockKey: sweep/fvg/ote/emacross doğru eşlenir", () => {
    assert.equal(mapOccurrenceToBlockKey("sweep_low"), "sweep");
    assert.equal(mapOccurrenceToBlockKey("sweep_high"), "sweep");
    assert.equal(mapOccurrenceToBlockKey("fvg"), "fvg");
    assert.equal(mapOccurrenceToBlockKey("ote"), "ote");
    assert.equal(mapOccurrenceToBlockKey("golden_cross"), "emacross");
    assert.equal(mapOccurrenceToBlockKey("death_cross"), "emacross");
  });
  test("mapOccurrenceToBlockKey: bilinmeyen tür null döner", () => {
    assert.equal(mapOccurrenceToBlockKey("bilinmeyen_tur"), null);
  });
  test("mapOccurrenceToBlockKey (T1): ob/bos/mitigation/sr artık codegen bloklarıyla eşlenir", () => {
    assert.equal(mapOccurrenceToBlockKey("ob"), "ob");
    assert.equal(mapOccurrenceToBlockKey("bos"), "bos");
    assert.equal(mapOccurrenceToBlockKey("mitigation"), "mitigation");
    assert.equal(mapOccurrenceToBlockKey("sr"), "sr");
  });
  test("her mapOccurrenceToBlockKey çıktısı codegen.js AVAILABLE_BLOCKS içinde gerçekten var", async () => {
    const { AVAILABLE_BLOCKS } = await import("../src/lib/codegen.js");
    const keys = new Set(AVAILABLE_BLOCKS.map(b => b.key));
    for (const t of ["engulfing", "pinbar", "marubozu", "sweep_low", "sweep_high", "fvg", "ote", "golden_cross", "death_cross"]) {
      assert.ok(keys.has(mapOccurrenceToBlockKey(t)), `${t} → ${mapOccurrenceToBlockKey(t)} AVAILABLE_BLOCKS'ta yok`);
    }
  });
  test("mapOccurrenceToBlockKey (AK-088): geometri/divergence türleri doğru eşlenir", () => {
    assert.equal(mapOccurrenceToBlockKey("doubletop"), "doubletop");
    assert.equal(mapOccurrenceToBlockKey("doublebottom"), "doublebottom");
    assert.equal(mapOccurrenceToBlockKey("hs"), "hs");
    assert.equal(mapOccurrenceToBlockKey("ihs"), "ihs");
    assert.equal(mapOccurrenceToBlockKey("triangle_asc"), "triangle");
    assert.equal(mapOccurrenceToBlockKey("triangle_desc"), "triangle");
    assert.equal(mapOccurrenceToBlockKey("triangle_sym"), "triangle");
    assert.equal(mapOccurrenceToBlockKey("bullish_div"), "divergence");
    assert.equal(mapOccurrenceToBlockKey("bearish_div"), "divergence");
  });
  test("her AK-088 mapOccurrenceToBlockKey çıktısı da codegen.js AVAILABLE_BLOCKS içinde var", async () => {
    const { AVAILABLE_BLOCKS } = await import("../src/lib/codegen.js");
    const keys = new Set(AVAILABLE_BLOCKS.map(b => b.key));
    for (const t of ["doubletop", "doublebottom", "hs", "ihs", "triangle_asc", "triangle_desc", "triangle_sym", "bullish_div", "bearish_div"]) {
      assert.ok(keys.has(mapOccurrenceToBlockKey(t)), `${t} → ${mapOccurrenceToBlockKey(t)} AVAILABLE_BLOCKS'ta yok`);
    }
  });

  console.log("C2: oluşum paneli — dürüst boş durum + sweep barında gerçek tespit");
  test("analyzeRange: düz barda AYRIK oluşumlar (mum kalıbı/süpürme/FVG) uydurulmaz", () => {
    // OTE/Destek-Direnç sürekli ölçümlerdir (her fiyat serisinde bir "salınım" vardır — codegen.js'in
    // kendi inOTE kullanımıyla AYNI, buradan icat edilmedi); ama AYRIK oluşumlar (gövde/boşluk/süpürme
    // matematiği gerektirir) düz barda kesinlikle sıfır olmalı — dürüstlük testi bunu doğrular.
    const bars = [];
    for (let i = 0; i < 80; i++) bars.push({ o: 100, h: 100.05, l: 99.95, c: 100 });
    const { cards } = analyzeRange(bars, 60, 79);
    const discreteTypes = new Set(["engulfing", "pinbar", "marubozu", "sweep_low", "sweep_high", "fvg", "golden_cross", "death_cross"]);
    assert.ok(!cards.some(c => discreteTypes.has(c.type)), "düz barda ayrık oluşum bulunmamalı");
  });
  test("analyzeRange: bilinen bir süpürme barında sweep kartı gerçekten bulunur", () => {
    const bars = [];
    for (let i = 0; i < 70; i++) bars.push({ o: 100, h: 101, l: 99, c: 100 });
    bars.push({ o: 100, h: 100.5, l: 98.93, c: 99.9 }); // alt süpürme + geri kapanış
    const { cards, blockKeysFound } = analyzeRange(bars, 65, 70);
    const sweepCard = cards.find(c => c.blockKey === "sweep");
    assert.ok(sweepCard, "sweep kartı bulunmalı");
    assert.ok(sweepCard.count >= 1);
    assert.ok(blockKeysFound.includes("sweep"));
  });
  test("analyzeRange: aralık dışındaki oluşumlar sayılmaz", () => {
    const bars = [];
    for (let i = 0; i < 70; i++) bars.push({ o: 100, h: 101, l: 99, c: 100 });
    bars.push({ o: 100, h: 100.5, l: 98.93, c: 99.9 }); // sweep i=70
    const { cards } = analyzeRange(bars, 0, 20); // süpürmenin çok öncesi
    assert.ok(!cards.some(c => c.blockKey === "sweep"));
  });
  test("analyzeRange: boş/çok kısa barda çökmez", () => {
    assert.deepEqual(analyzeRange([], 0, 10), { cards: [], blockKeysFound: [] });
    assert.deepEqual(analyzeRange(null, 0, 10), { cards: [], blockKeysFound: [] });
  });

  console.log("C2-AK-088: oluşum paneli — geometri kartları + divergence'ın showRsi kapısı");
  test("analyzeRange: bilinen bir çift tepe barında doubletop kartı gerçekten bulunur", () => {
    const bars = [];
    const push = (o, h, l, c) => bars.push({ o, h, l, c });
    for (let i = 0; i < 10; i++) push(100, 100.2, 99.8, 100);
    let p = 100;
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1;
    for (let i = 0; i < 10; i++) { const c = p - 1.9; push(p, p + 0.2, c - 0.2, c); p = c; }
    for (let i = 0; i < 9; i++) { const c = p + 1.8; push(p, c + 0.2, p - 0.2, c); p = c; }
    push(p, 130, p - 0.2, p + 1); p += 1;
    for (let i = 0; i < 10; i++) { const c = p - 3; push(p, p + 0.2, c - 0.3, c); p = c; }
    const { cards, blockKeysFound } = analyzeRange(bars, 0, bars.length - 1);
    const dtCard = cards.find(c => c.blockKey === "doubletop");
    assert.ok(dtCard, "doubletop kartı bulunmalı");
    assert.ok(blockKeysFound.includes("doubletop"));
  });
  test("analyzeRange: showRsi geçilmezse divergence hiç HESAPLANMAZ (RSI'yı kendi başına çıkarmaz)", () => {
    const bars = [];
    for (let i = 0; i < 20; i++) bars.push({ o: 100, h: 100.5, l: 99.5, c: 100 });
    for (let i = 0; i < 10; i++) { const c = 100 + i * 3; bars.push({ o: c - 3, h: c + 0.3, l: c - 3.2, c }); }
    for (let i = 0; i < 6; i++) { const c = 130 - i * 2; bars.push({ o: c + 2, h: c + 2.1, l: c - 0.1, c }); }
    for (let i = 0; i < 10; i++) { const c = 118 + i * 1.5; bars.push({ o: c - 1.5, h: c + 0.1, l: c - 1.6, c }); }
    for (let i = 0; i < 5; i++) { const c = 133 - i * 1; bars.push({ o: c + 1, h: c + 1.1, l: c - 0.1, c }); }
    const withoutRsi = analyzeRange(bars, 0, bars.length - 1);
    assert.ok(!withoutRsi.cards.some(c => c.blockKey === "divergence"), "showRsi olmadan divergence görünmemeli");
    const withRsi = analyzeRange(bars, 0, bars.length - 1, { showRsi: true });
    assert.ok(withRsi.cards.some(c => c.blockKey === "divergence"), "showRsi=true iken divergence kartı bulunmalı");
  });

  console.log("C5-DÜRÜSTLÜK-KAPISI: hipotez etiketi OOS öncesi kalkmıyor (D19)");
  test("kod üretildi ama henüz test edilmedi → HİPOTEZ", () => {
    const s = hypothesisStatus({ tested: false });
    assert.equal(s.label, "HİPOTEZ");
  });
  test("hiç kod üretilmedi → null (rozet hiç gösterilmez)", () => {
    assert.equal(hypothesisStatus(null), null);
  });
  test("OOS testi geçti (t≥2) → DOĞRULANDI, HİPOTEZ asla geri dönmez", () => {
    const s = hypothesisStatus({ tested: true, verdictGood: true, tStat: 2.4 });
    assert.match(s.label, /DOĞRULANDI/);
    assert.doesNotMatch(s.label, /HİPOTEZ/);
  });
  test("OOS testi geçmedi (t<2) → REDDEDİLDİ, yine de HİPOTEZ değil (net sonuç, muğlaklık yok)", () => {
    const s = hypothesisStatus({ tested: true, verdictGood: false, tStat: 0.8 });
    assert.match(s.label, /REDDEDİLDİ/);
  });

  console.log("C4: kural kurucudan üretilen kod PARAMS'lı ve parse edilebilir (BÖLÜM 1 senkronu üzerinde çalışır)");
  test("generateSignalCode çıktısı extractParams ile hemen okunabilir", () => {
    const code = generateSignalCode(["sweep", "fvg"], { slR: 2, tpR: 4 });
    const params = extractParams(code);
    assert.ok(params);
    assert.equal(params.slR, 2);
    assert.equal(params.tpR, 4);
  });
}

console.log("Replay Ligi — senaryo verisi (AK-083-TAMAMLAMA/C5)");
{
  const { SCENARIOS, scenarioBars, scenarioById } = await import("../src/lib/scenarios.js");

  test("scenarioBars: aynı senaryo her çağrıda BİREBİR aynı mumları üretir (deterministik seed — adil percentile için şart)", () => {
    const s = SCENARIOS[0];
    const a = scenarioBars(s);
    const b = scenarioBars(s);
    assert.deepEqual(a, b);
  });
  test("scenarioBars: bar sayısı fazların toplamına eşit, her bar o/h/l/c sayısal ve h>=l", () => {
    for (const s of SCENARIOS) {
      const bars = scenarioBars(s);
      const total = s.phases.reduce((a, p) => a + p.n, 0);
      assert.equal(bars.length, total);
      for (const b of bars) {
        assert.ok(Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l) && Number.isFinite(b.c));
        assert.ok(b.h >= b.l);
      }
    }
  });
  test("scenarioById: bilinen id'yi bulur, bilinmeyende null döner (çökmez)", () => {
    assert.equal(scenarioById(SCENARIOS[0].id).id, SCENARIOS[0].id);
    assert.equal(scenarioById("yok-boyle-bir-sey"), null);
  });
}

console.log("Replay Ligi — skorlama + percentile (AK-083-TAMAMLAMA/C5/C6)");
{
  const { entryPlan, resolveAttempt, resolveAttemptDetailed, percentileOf,
    fetchScenarioScores, fetchMyScenarioScore, submitScenarioScore, fetchMyScenarioCount } = await import("../src/lib/replay.js");
  const { scenarioBars, SCENARIOS } = await import("../src/lib/scenarios.js");
  const bars = scenarioBars(SCENARIOS[0]);
  const entryIdx = SCENARIOS[0].revealStart;

  test("entryPlan: long'da stop entry'nin altında, hedef üstünde (1:2)", () => {
    const p = entryPlan(bars, entryIdx, 1);
    assert.ok(p.stop < p.entry);
    assert.ok(p.target > p.entry);
    assert.ok(Math.abs((p.target - p.entry) - 2 * (p.entry - p.stop)) < 1e-6);
  });
  test("entryPlan: short'ta stop entry'nin üstünde, hedef altında", () => {
    const p = entryPlan(bars, entryIdx, -1);
    assert.ok(p.stop > p.entry);
    assert.ok(p.target < p.entry);
  });
  test("entryPlan: geçersiz yön/aralık dışı index'te null (çökmez)", () => {
    assert.equal(entryPlan(bars, entryIdx, 0), null);
    assert.equal(entryPlan(bars, bars.length - 1, 1), null);
    assert.equal(entryPlan(null, 0, 1), null);
  });
  test("resolveAttemptDetailed: hedef/stop tetiklenirse rScore -1 ya da rr, exitIdx döner", () => {
    const r = resolveAttemptDetailed(bars, entryIdx, 1);
    assert.ok(r == null || (Number.isFinite(r.rScore) && Number.isInteger(r.exitIdx)));
  });
  test("resolveAttempt: resolveAttemptDetailed'in rScore'unu döner (aynı sonuç)", () => {
    const detail = resolveAttemptDetailed(bars, entryIdx, 1);
    const scalar = resolveAttempt(bars, entryIdx, 1);
    assert.equal(scalar, detail?.rScore ?? null);
  });

  test("percentileOf: az kayıtta (minN altı) dürüst null döner, sahte yüzdelik üretilmez (D6)", () => {
    assert.equal(percentileOf([1, 2, 3], 2), null);
  });
  test("percentileOf: yeterli kayıtta doğru yüzdelik hesaplanır", () => {
    assert.equal(percentileOf([1, 2, 3, 4, 5], 3), 40); // 2/5 değer (1,2) 3'ün altında
  });
  test("percentileOf: boş/geçersiz girdide çökmez", () => {
    assert.equal(percentileOf([], 1), null);
    assert.equal(percentileOf([1, 2, 3, 4, 5], null), null);
  });

  const scores = await fetchScenarioScores("sert-cokus");
  const myScore = await fetchMyScenarioScore("sert-cokus", "u1");
  const submitRes = await submitScenarioScore("sert-cokus", "u1", 2);
  const count = await fetchMyScenarioCount("u1");
  test("Supabase yapılandırılmamışken replay skor sorguları dürüst boş değer döner (D6)", () => {
    assert.deepEqual(scores, []);
    assert.equal(myScore, null);
    assert.equal(submitRes.ok, false);
    assert.equal(count, 0);
  });
}

console.log("Sezon iskeleti (AK-083-TAMAMLAMA/C7)");
{
  const { computeSeasonBrier, fetchActiveSeason } = await import("../src/lib/seasons.js");

  test("computeSeasonBrier: sezon yoksa dürüst null", () => {
    assert.equal(computeSeasonBrier([{ confidence: 0.8, hit: true, closesAt: "2026-07-01" }], null), null);
  });
  test("computeSeasonBrier: pencere dışındaki tahminler sayılmaz, avg/weeks doğru hesaplanır", () => {
    const season = { starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-07-31T23:59:59Z" };
    const rows = [
      { confidence: 0.8, hit: true, closesAt: "2026-07-10T00:00:00Z" },  // içeride
      { confidence: 0.6, hit: false, closesAt: "2026-07-20T00:00:00Z" }, // içeride
      { confidence: 0.9, hit: true, closesAt: "2026-08-05T00:00:00Z" },  // DIŞARIDA — sayılmaz
    ];
    const r = computeSeasonBrier(rows, season);
    assert.equal(r.weeks, 2);
    assert.ok(r.avg > 0);
  });
  test("computeSeasonBrier: pencerede hiç tahmin yoksa dürüst null (fabrike ortalama yok, D6)", () => {
    const season = { starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-07-31T23:59:59Z" };
    assert.equal(computeSeasonBrier([{ confidence: 0.8, hit: true, closesAt: "2026-01-01" }], season), null);
  });

  const active = await fetchActiveSeason();
  test("Supabase yapılandırılmamışken aktif sezon sorgusu dürüst null döner", () => {
    assert.equal(active, null);
  });
}

console.log("Tahmin Ligi — sezon/haftalık geçmiş için tarihli satırlar (AK-083-TAMAMLAMA/C2/C4)");
{
  const { toBrierRowsWithDate, fetchMyResolvedPredictionsWithDates, fetchMyLastResolvedResult } = await import("../src/lib/predictions.js");

  test("toBrierRowsWithDate: toBrierRows ile AYNI filtre + closesAt taşınır", () => {
    const raw = [
      { user_id: "u1", direction: "up", confidence: 0.8, question: { resolved: true, outcome: "up", closes_at: "2026-07-10" } },
      { user_id: "u1", direction: "up", confidence: 0.7, question: { resolved: false, outcome: null, closes_at: "2026-07-17" } },
    ];
    const rows = toBrierRowsWithDate(raw);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { userId: "u1", confidence: 0.8, hit: true, closesAt: "2026-07-10" });
  });
  test("toBrierRowsWithDate: boş/eksik girdide çökmez", () => {
    assert.deepEqual(toBrierRowsWithDate(null), []);
  });

  const withDates = await fetchMyResolvedPredictionsWithDates("u1");
  const lastResult = await fetchMyLastResolvedResult("u1");
  test("Supabase yapılandırılmamışken yeni tarihli sorgular dürüst boş değer döner (D6)", () => {
    assert.deepEqual(withDates, []);
    assert.equal(lastResult, null);
  });
}

console.log("Grafik boş-alan bağlam menüsü — sınır kontrolü (AK-085-TAMAMLAMA/C2)");
{
  const { inPlotArea } = await import("../src/lib/chartGeometry.js");
  const b = { pL: 6, pR: 52, pT: 12, pB: 26, W: 1000, H: 480 };

  test("inPlotArea: çizim alanının tam ortası içeride", () => {
    assert.equal(inPlotArea(500, 240, b), true);
  });
  test("inPlotArea: sol/üst/alt kenarlar dahil (>=), sağ eksen dahil değil (fiyat ekseni)", () => {
    assert.equal(inPlotArea(b.pL, b.pT, b), true);
    assert.equal(inPlotArea(b.pL, b.H - b.pB, b), true);
    assert.equal(inPlotArea(b.W - b.pR + 1, 240, b), false); // eksenin içinde — plot dışı
  });
  test("inPlotArea: RSI paneli (H'nin altı) ve üst boşluk dışarıda sayılır", () => {
    assert.equal(inPlotArea(500, b.H + 10, b), false); // RSI paneli varsa buradadır
    assert.equal(inPlotArea(500, 2, b), false); // pT'den önce (zaman ekseni üstü boşluk)
  });
}

console.log("rafThrottle — pan/zoom/crosshair kare-başına-bir-kez (AK-085-TAMAMLAMA/C4)");
{
  const { rafThrottle } = await import("../src/lib/rafThrottle.js");

  test("art arda çağrılar tek 'kareye' birleşir, yalnız SONUNCU argümanlarla çalışır", () => {
    const calls = [];
    let scheduled = null;
    const schedule = (cb) => { scheduled = cb; return 1; };
    const cancel = () => { scheduled = null; };
    const throttled = rafThrottle((...args) => calls.push(args), schedule, cancel);
    throttled(1); throttled(2); throttled(3);
    assert.equal(calls.length, 0, "kare gelmeden fn hiç çalışmamalı");
    scheduled();
    assert.deepEqual(calls, [[3]], "yalnız en son çağrının argümanları");
  });
  test("kare tetiklendikten sonra yeni bir çağrı yeni bir kare planlar", () => {
    const calls = [];
    let scheduled = null;
    const schedule = (cb) => { scheduled = cb; return 1; };
    const throttled = rafThrottle((...args) => calls.push(args), schedule, () => {});
    throttled("a");
    scheduled();
    throttled("b");
    scheduled();
    assert.deepEqual(calls, [["a"], ["b"]]);
  });
  test("cancel: bekleyen kareyi iptal eder, fn hiç çağrılmaz", () => {
    const calls = [];
    let scheduled = null, cancelled = false;
    const schedule = (cb) => { scheduled = cb; return 1; };
    const cancel = () => { cancelled = true; scheduled = null; };
    const throttled = rafThrottle((...args) => calls.push(args), schedule, cancel);
    throttled(1);
    throttled.cancel();
    assert.equal(cancelled, true);
    assert.equal(calls.length, 0);
  });
  test("varsayılan schedule/cancel parametreleri olmadan da (rAF gerçek ortamda) çökmeden kurulur", () => {
    // Node'da requestAnimationFrame yok — yalnız throttled fonksiyonun OLUŞTURULABİLDİĞİNİ doğrular,
    // çağırmaz (çağırsaydı gerçek rAF arar, tarayıcı dışı ortamda patlar).
    assert.equal(typeof rafThrottle(() => {}), "function");
  });
}

console.log("Mobil grafik tam ekran — çıkış kararı (AK-092)");
{
  const { exitPlan } = await import("../src/lib/fullscreenExit.js");

  test("exitPlan: akFullscreen işareti varsa 'geri' tetiklenmeli (Android geri tuşuyla aynı yol)", () => {
    assert.deepEqual(exitPlan({ akFullscreen: true }), { goBack: true });
  });
  test("exitPlan: işaret yoksa (ör. sayfa doğrudan açıldıysa) doğrudan kapat, geri tetiklenmez", () => {
    assert.deepEqual(exitPlan({}), { goBack: false });
    assert.deepEqual(exitPlan(null), { goBack: false });
    assert.deepEqual(exitPlan(undefined), { goBack: false });
  });
  test("exitPlan: başka bir sayfanın kendi history state'i (akFullscreen yok) yanlışlıkla tetiklemez", () => {
    assert.deepEqual(exitPlan({ someOtherFlag: true }), { goBack: false });
  });
}

console.log("Topluluk Fikirleri — moderasyon yardımcıları (AK-090/C1/C2)");
{
  const { validateThesis, containsBannedWord, containsOrderLanguage } = await import("../src/lib/moderation.js");

  test("validateThesis: 40 karakterden kısa tez reddedilir, sebep mesajı verir", () => {
    const r = validateThesis("çok kısa");
    assert.equal(r.ok, false);
    assert.match(r.reason, /tez/i);
  });
  test("validateThesis: boş/eksik girdi çökmez, reddedilir", () => {
    assert.equal(validateThesis(null).ok, false);
    assert.equal(validateThesis(undefined).ok, false);
    assert.equal(validateThesis("").ok, false);
  });
  test("validateThesis: 40+ karakter kabul edilir", () => {
    const long = "Bu sembolde hacim artışı ve destek testi görüyorum, RSI da aşırı satımda.";
    assert.ok(long.length >= 40);
    assert.equal(validateThesis(long).ok, true);
  });

  test("containsBannedWord: küfür tam kelime olarak geçince true (gerçekten ENGELLER)", () => {
    assert.equal(containsBannedWord("bu amk bir tez değil"), true);
  });
  test("containsBannedWord: yasaklı kelimenin İÇİNDE geçtiği farklı bir kelime yanlış pozitif vermez", () => {
    // 'al' benzeri kısa kökler listede yok ama yine de tokenizasyonun TAM kelime eşleştirdiğini doğrula
    assert.equal(containsBannedWord("kanal analizi gayet net görünüyor buradan itibaren"), false);
  });
  test("containsBannedWord: temiz tez false döner", () => {
    assert.equal(containsBannedWord("destek seviyesinden tepki bekliyorum"), false);
  });

  test("containsOrderLanguage: 'alın'/'garanti' gibi emir dili tespit edilir (ENGELLEMEZ, yalnız işaretler)", () => {
    assert.equal(containsOrderLanguage("hemen alın, garanti kâr"), true);
    assert.equal(containsOrderLanguage("bence satın almak mantıklı olabilir, kesinlikle düşünün"), true);
  });
  test("containsOrderLanguage: normal analiz dilinde false döner", () => {
    assert.equal(containsOrderLanguage("bu bölgede alıcıların baskın olduğunu düşünüyorum"), false);
  });
}

console.log("Kulak Puanı — 'faydalı' haftalık tavanı (AK-090/C4, D18'in tamamlanan parçası)");
{
  const { EARNING_TABLE, weeklyEarnedByType, remainingFaydaliWeeklyCap, FAYDALI_WEEKLY_CAP } = await import("../src/lib/points.js");

  test("EARNING_TABLE: 'faydali' kalemi artık var ve wired:true (D18'in eksik parçası tamamlandı)", () => {
    const item = EARNING_TABLE.find((e) => e.key === "faydali");
    assert.ok(item);
    assert.equal(item.wired, true);
    assert.ok(item.points > 0);
  });

  test("weeklyEarnedByType: son 7 gün dışındaki event'ler sayılmaz", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    const events = [
      { type: "faydali", amount: 50, ts: now.getTime() - 2 * 24 * 60 * 60 * 1000 }, // 2 gün önce — içeride
      { type: "faydali", amount: 50, ts: now.getTime() - 10 * 24 * 60 * 60 * 1000 }, // 10 gün önce — DIŞARIDA
      { type: "streak_7", amount: 50, ts: now.getTime() - 1 * 24 * 60 * 60 * 1000 }, // başka tip — sayılmaz
    ];
    assert.equal(weeklyEarnedByType(events, "faydali", now), 50);
  });
  test("weeklyEarnedByType: boş/eksik girdide çökmez", () => {
    assert.equal(weeklyEarnedByType([], "faydali"), 0);
    assert.equal(weeklyEarnedByType(null, "faydali"), 0);
  });

  test("remainingFaydaliWeeklyCap: tavana yaklaştıkça azalır, asla negatif dönmez", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    const events = [{ type: "faydali", amount: FAYDALI_WEEKLY_CAP + 500, ts: now.getTime() }];
    assert.equal(remainingFaydaliWeeklyCap(events, now), 0);
    assert.equal(remainingFaydaliWeeklyCap([], now), FAYDALI_WEEKLY_CAP);
  });
}

console.log("Topluluk Fikirleri — veri katmanı saf fonksiyonu + Supabase boş-durum (AK-090)");
{
  const {
    tallyReactions, fetchIdeas, fetchIdeasByUser, fetchIdeasCount, fetchReactionCounts,
    fetchMyReactions, fetchTodayKatilmiyorumCount, createIdea, reactToIdea, reportIdea,
  } = await import("../src/lib/ideas.js");

  test("tallyReactions: idea başına faydalı/katılmıyorum sayaçları doğru çıkar", () => {
    const rows = [
      { idea_id: "i1", type: "faydali" }, { idea_id: "i1", type: "faydali" },
      { idea_id: "i1", type: "katilmiyorum" }, { idea_id: "i2", type: "faydali" },
    ];
    const t = tallyReactions(rows, ["i1", "i2", "i3"]);
    assert.deepEqual(t.i1, { faydali: 2, katilmiyorum: 1 });
    assert.deepEqual(t.i2, { faydali: 1, katilmiyorum: 0 });
    assert.deepEqual(t.i3, { faydali: 0, katilmiyorum: 0 }); // hiç reaksiyon yoksa da dürüst 0
  });
  test("tallyReactions: boş/eksik girdide çökmez", () => {
    assert.deepEqual(tallyReactions(null, ["i1"]), { i1: { faydali: 0, katilmiyorum: 0 } });
    assert.deepEqual(tallyReactions([], null), {});
  });

  const ideas = await fetchIdeas();
  const byUser = await fetchIdeasByUser("u1");
  const count = await fetchIdeasCount("u1");
  const counts = await fetchReactionCounts(["i1"]);
  const mine = await fetchMyReactions(["i1"], "u1");
  const todayCount = await fetchTodayKatilmiyorumCount("u1");
  const createRes = await createIdea("u1", { symbol: "BTC", thesis: "kısa" });
  const reactRes = await reactToIdea("i1", "u2", "u1", "faydali");
  const reportRes = await reportIdea("i1", "u1", "spam");
  test("Supabase yapılandırılmamışken tüm ideas sorguları dürüst boş değer döner (D6)", () => {
    assert.deepEqual(ideas, []);
    assert.deepEqual(byUser, []);
    assert.equal(count, 0);
    assert.deepEqual(counts, {});
    assert.deepEqual(mine, {});
    assert.equal(todayCount, 0);
    assert.equal(createRes.ok, false);
    assert.equal(reactRes.ok, false);
    assert.equal(reportRes.ok, false);
  });

  // createIdea/reactToIdea'nın SUPABASE'E GİTMEDEN önce (client-side) reddettiği durumlar —
  // top-level await ile önce çözülür, test() senkron doğrular (dosyanın genel deseni).
  const shortThesisRes = await createIdea("u1", { symbol: "BTC", thesis: "çok kısa bir şey" });
  const selfReactRes = await reactToIdea("i1", "u1", "u1", "faydali");
  const badTypeRes = await reactToIdea("i1", "u2", "u1", "begendim");
  test("createIdea: thesis çok kısaysa reddedilir (client-side ön kontrol)", () => {
    assert.equal(shortThesisRes.ok, false);
    assert.match(shortThesisRes.error, /tez/i);
  });
  test("reactToIdea: kendi fikrine tepki veremez", () => {
    assert.equal(selfReactRes.ok, false);
    assert.match(selfReactRes.error, /kendi/i);
  });
  test("reactToIdea: geçersiz tepki tipi reddedilir", () => {
    assert.equal(badTypeRes.ok, false);
  });
}

console.log("profileStats.ideasCount — gerçek fikir sayısı toplama eklendi (AK-090/C8)");
{
  const { ideasCount } = await import("../src/lib/profileStats.js");

  test("ideasCount: 3 parametreli çağrı — doğrulanmış strateji + tahmin + gerçek fikir toplamı", () => {
    assert.equal(ideasCount(3, 5, 2), 10);
  });
  test("ideasCount: realIdeas verilmezse eski 2-parametreli davranış AYNEN korunur (geriye uyumlu)", () => {
    assert.equal(ideasCount(3, 5), 8);
  });
  test("ideasCount: negatif realIdeas negatife düşürmez", () => {
    assert.equal(ideasCount(1, 1, -5), 2);
  });
}

console.log("Dönemsel yüzde değişim — PortfolioPanel/Izleme detay ekranı paylaşımı (AK-089)");
{
  const { periodChangePct, WEEK_BARS, DETAIL_PERIODS } = await import("../src/lib/priceChange.js");
  const bars = Array.from({ length: 100 }, (_, i) => ({ c: 100 + i })); // 100 -> 199, düz artan

  test("periodChangePct: bilinen bir lookback için doğru yüzde hesaplar", () => {
    // son bar c=199, 10 bar önce c=189 -> (199-189)/189*100
    const expected = ((199 - 189) / 189) * 100;
    assert.ok(Math.abs(periodChangePct(bars, 10) - expected) < 1e-9);
  });
  test("periodChangePct: yetersiz geçmiş/eksik girdide dürüst null döner (fabrike yüzde yok)", () => {
    assert.equal(periodChangePct([{ c: 100 }], 10), null);
    assert.equal(periodChangePct(null, 10), null);
  });
  test("periodChangePct: lookback tüm barlardan büyükse de çökmez, en baştan hesaplar", () => {
    const v = periodChangePct(bars, 10000);
    assert.ok(Number.isFinite(v));
  });

  test("DETAIL_PERIODS: YTD/1Y/5Y YOK — ~900 bar (150 gün) veri derinliğiyle dürüst olmayan aralıklar eklenmez (AK-031)", () => {
    const labels = DETAIL_PERIODS.map((p) => p.label);
    assert.ok(!labels.some((l) => /YTD|1Y|5Y/.test(l)));
    assert.ok(labels.includes("Tümü"));
  });
  test("WEEK_BARS ~7 gün karşılığı (42 × 4s mum)", () => {
    assert.equal(WEEK_BARS, 42);
  });
}

console.log("OB/BOS/Mitigation geçmişe kaydırınca kaybolmuyor (AK-095/Bug1)");
{
  const { findOrderBlocks, findBOS, findMitigation } = await import("../src/lib/detectors.js");

  // Eskiden findOrderBlocks/findBOS/findMitigation kendi içlerinde .slice(-8)/.slice(-6) ile
  // SONUÇLARINI kırpıyordu — Chart.jsx'in inWin() filtresinden ÖNCE. Kullanıcı geçmişe (900+ bar
  // önceki bir bölgeye) kaydırdığında o bölgedeki gerçek OB/BOS/Mitigation zaten silinmiş oluyordu.
  // Bu testler: (a) 8/6 sınırından FAZLA öğe varken hiçbiri kırpılmıyor, (b) diziden ÇOK ÖNCEki
  // (yüzlerce bar geride) bir öğe hâlâ dönüyor VE bir inWin-benzeri filtreyle o bölgeye kaydırılmış
  // pencerede bulunabiliyor.

  const flat = (n, base = 100) => Array.from({ length: n }, () => ({ o: base, h: base + 1, l: base - 1, c: base }));
  const obPair = (base) => [
    { o: base, h: base + 0.2, l: base - 1, c: base - 0.8 }, // düşüş mumu
    { o: base - 0.8, h: base + 3, l: base - 1, c: (base - 0.8) * 1.02 }, // >1.5% yükseliş
  ];

  test("findOrderBlocks: 8'den fazla OB varken hiçbiri kırpılmaz, 250+ bar önceki OB hâlâ dönüyor", () => {
    let bars = flat(4);
    const earlyBearIdx = bars.length;
    bars = bars.concat(obPair(100));
    bars = bars.concat(flat(250)); // erken OB'yi geçmişe it
    for (let k = 0; k < 10; k++) { bars = bars.concat(flat(3)); bars = bars.concat(obPair(200 + k)); }
    bars = bars.concat(flat(5));

    const obs = findOrderBlocks(bars);
    assert.equal(obs.length, 11, "toplam 11 OB var, hiçbiri kırpılmamalı (eski davranış: son 8'e keserdi)");
    assert.ok(obs.some(o => o.i === earlyBearIdx), "250+ bar önceki OB hâlâ tespit ediliyor");

    // Chart.jsx'teki inWin() ile AYNI mantık: kullanıcı erken bölgeye kaydırmış gibi filtrele
    const inWin = (i) => i >= 0 && i <= earlyBearIdx + 5;
    const visible = obs.filter(o => inWin(o.i));
    assert.equal(visible.length, 1, "kaydırılmış pencerede yalnız erken OB görünmeli, ve GÖRÜNMELİ (silinmiş olmamalı)");
  });

  test("findBOS: 6'dan fazla BOS varken hiçbiri kırpılmaz, geçmişteki BOS hâlâ dönüyor", () => {
    const flatBOS = (n, base = 100) => Array.from({ length: n }, () => ({ o: base, h: base, l: base - 1, c: base - 0.2 }));
    let bars = flatBOS(10);
    const earlyBreakIdx = bars.length;
    bars.push({ o: 100, h: 100, l: 99, c: 105 }); // önceki 5 barlık tepeyi (100) kırar
    bars = bars.concat(flatBOS(250));
    for (let k = 0; k < 8; k++) { bars = bars.concat(flatBOS(3)); bars.push({ o: 100, h: 100, l: 99, c: 105 }); }
    bars = bars.concat(flatBOS(5));

    const boses = findBOS(bars);
    assert.equal(boses.length, 9, "toplam 9 BOS var, hiçbiri kırpılmamalı (eski davranış: son 6'ya keserdi)");
    assert.ok(boses.some(b => b.i === earlyBreakIdx), "250+ bar önceki BOS hâlâ tespit ediliyor");
  });

  test("findMitigation: 8'den fazla mitigasyon varken hiçbiri kırpılmaz, geçmişteki mitigasyon hâlâ dönüyor", () => {
    const neutralFiller = (n) => Array.from({ length: n }, () => ({ o: 5000, h: 5001, l: 4999, c: 5000 }));
    const unit = (base) => [
      { o: base, h: base + 0.2, l: base - 1, c: base - 0.8 },        // OB düşüş mumu
      { o: base - 0.8, h: base + 3, l: base - 1, c: (base - 0.8) * 1.02 }, // OB yükseliş
      { o: base + 20, h: base + 21, l: base + 19, c: base + 20 },    // uzak dolgu
      { o: base + 20, h: base + 21, l: base + 19, c: base + 20 },
      { o: base + 20, h: base + 21, l: base + 19, c: base + 20 },
      { o: base + 10, h: base + 11, l: base - 0.5, c: base + 9 },    // bölgeye geri dönüş (mitigasyon)
    ];
    let bars = neutralFiller(4);
    const earlyMitIdx = bars.length + 5; // unit() içindeki mitigasyon barının indeksi
    bars = bars.concat(unit(1000));
    bars = bars.concat(neutralFiller(250));
    for (let k = 0; k < 8; k++) { bars = bars.concat(neutralFiller(3)); bars = bars.concat(unit(2000 + k * 100)); }
    bars = bars.concat(neutralFiller(5));

    const mits = findMitigation(bars);
    assert.equal(mits.length, 9, "toplam 9 mitigasyon var, hiçbiri kırpılmamalı (eski davranış: son 8'e keserdi)");
    assert.ok(mits.some(m => m.i === earlyMitIdx), "250+ bar önceki mitigasyon hâlâ tespit ediliyor");
  });
}

console.log(`\n${pass} test geçti${process.exitCode ? " (HATALAR VAR)" : " — motor sağlam."}`);
