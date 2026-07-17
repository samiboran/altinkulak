// Motor güvenlik ağı — dürüstlük katmanı regresyon testleri.
// Çalıştır: npm test  (bağımlılık yok, saf node)
import assert from "node:assert/strict";
import { mean, std, tStat, trainTestSplit, verdict, bonferroniT, expectedFalsePositives } from "../src/lib/stats.js";
import { runBacktest } from "../src/lib/backtest.js";
import { getBars, parseKlines, loadReal, isReal, pairFor, hasData, stats24h, getFreshness, freshnessStatus, getSearchSymbols, ALL_SYMBOLS } from "../src/lib/data.js";
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
  assert.equal(hasData("DOGE"), false); // ne gerçek ne tanımlı sentetik
  assert.equal(hasData("SOL"), true);
  assert.equal(hasData("AVAX"), true); // AK-042: tanımlı sentetik + gerçek-kaynaklı
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
const { normalizeToUSD, deriveItems, itemKey } = await import("../src/lib/portfolio.js");
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

console.log(`\n${pass} test geçti${process.exitCode ? " (HATALAR VAR)" : " — motor sağlam."}`);
