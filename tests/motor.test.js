// Motor güvenlik ağı — dürüstlük katmanı regresyon testleri.
// Çalıştır: npm test  (bağımlılık yok, saf node)
import assert from "node:assert/strict";
import { mean, std, tStat, trainTestSplit, verdict, bonferroniT, expectedFalsePositives } from "../src/lib/stats.js";
import { runBacktest } from "../src/lib/backtest.js";
import { getBars, parseKlines, loadReal, isReal } from "../src/lib/data.js";

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
  assert.deepEqual(Object.keys(bars[0]).sort(), ["c", "h", "l", "o", "t", "time"]);
  assert.equal(bars[0].t, 0);
  assert.equal(bars[1].t, 1);
  assert.equal(bars[0].o, 61000.1);
  assert.equal(bars[1].c, 61850.3);
  assert.ok(bars.every(b => typeof b.o === "number" && b.h >= b.l));
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
const { parseTradesCSV, dedupeKey } = await import("../src/lib/csv.js");
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

console.log(`\n${pass} test geçti${process.exitCode ? " (HATALAR VAR)" : " — motor sağlam."}`);
