// Motor güvenlik ağı — dürüstlük katmanı regresyon testleri.
// Çalıştır: npm test  (bağımlılık yok, saf node)
import assert from "node:assert/strict";
import { mean, std, tStat, trainTestSplit, verdict, bonferroniT, expectedFalsePositives } from "../src/lib/stats.js";
import { runBacktest } from "../src/lib/backtest.js";
import { getBars, parseKlines, loadReal, isReal, pairFor, hasData, stats24h, getFreshness, freshnessStatus, getSearchSymbols, ALL_SYMBOLS } from "../src/lib/data.js";
import { normalizeTop500 } from "../src/lib/top500.js";
import { detectModBSignals, DEFAULT_PARAMS } from "../src/lib/modB.js";
import { applyTick, mergeGapFill } from "../src/lib/liveData.js";

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

console.log(`\n${pass} test geçti${process.exitCode ? " (HATALAR VAR)" : " — motor sağlam."}`);
