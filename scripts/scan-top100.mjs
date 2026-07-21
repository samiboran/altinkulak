#!/usr/bin/env node
// AK-104-EK (tek seferlik rapor script'i — production'a DOKUNMAZ):
// Piyasa değerine göre ilk 100 kripto arasından, Binance'de en az 2 yıldır işlem gören
// (yani yeterli 4H geçmiş barı olan — yeni listelenenler otomatik elenir) coinleri filtreler,
// mevcut backtest.js motorunu (FVG, Sıkı-mod/Bonferroni düzeltmeli) GERÇEK Binance 4H verisiyle
// çalıştırır, t-istatistiğine göre sıralı bir JSON+CSV rapor üretir.
//
// Bu script hiçbir production tabloya/UI'ya yazmaz — yalnız scripts/out/ altına bir rapor
// bırakır. Sami raporu görüp istediği sembolleri kendi eliyle İzleme'ye ekler.
//
// Çalıştır: node scripts/scan-top100.mjs
// Gereksinim: bu ortamdan CoinGecko + Binance'e (data-api.binance.vision / api.binance.com)
// giden ağ erişimi. Sandboxed Claude Code oturumlarında bu genelde POLİTİKA gereği 403 ile
// engellidir (curl + WebFetch ile iki ayrı yoldan doğrulandı, 2026-07-21) — böyle bir ortamda
// çalıştırmayı denersen "HTTP 403"/bağlantı hatası alırsın, kod hatası değildir.

import { writeFileSync, mkdirSync } from "node:fs";
import { runBacktest } from "../src/lib/backtest.js";
import { parseKlines } from "../src/lib/data.js";
import { bonferroniT } from "../src/lib/stats.js";

const TWO_YEARS_MS = 2 * 365 * 24 * 3600 * 1000;
const BINANCE_BASES = ["https://data-api.binance.vision", "https://api.binance.com"];
const REQUEST_DELAY_MS = 300; // CoinGecko/Binance ücretsiz katman rate-limit'ine karşı kibar gecikme

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json();
}

async function fetchTop100() {
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false";
  return fetchJson(url);
}

// pair'in Binance'te İLK kline'ının açılış zamanı (ms) — pair yoksa/boşsa null.
async function binanceFirstKlineTime(pair) {
  for (const base of BINANCE_BASES) {
    try {
      const rows = await fetchJson(`${base}/api/v3/klines?symbol=${pair}&interval=4h&startTime=0&limit=1`);
      if (Array.isArray(rows) && rows.length) return rows[0][0];
    } catch { /* sıradaki base'i dene */ }
  }
  return null;
}

// motor için son ~1000 4H mumu (mevcut runBacktest'in çalıştığı ~900 barlık pencereyle tutarlı).
async function binanceRecentKlines(pair, limit = 1000) {
  for (const base of BINANCE_BASES) {
    try {
      const rows = await fetchJson(`${base}/api/v3/klines?symbol=${pair}&interval=4h&limit=${limit}`);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* sıradaki base'i dene */ }
  }
  return null;
}

async function main() {
  console.log("İlk 100 coin çekiliyor (CoinGecko)...");
  const coins = await fetchTop100();
  console.log(`${coins.length} coin bulundu. Binance eşleşmesi + 2 yıllık geçmiş kontrolü başlıyor...`);

  const now = Date.now();
  const eligible = [];
  for (const c of coins) {
    const sym = String(c.symbol || "").toUpperCase();
    if (!sym) continue;
    const pair = `${sym}USDT`;
    const firstOpen = await binanceFirstKlineTime(pair);
    await sleep(REQUEST_DELAY_MS);
    if (firstOpen == null) { console.log(`  ⏭ ${sym}: Binance'te ${pair} yok`); continue; }
    if (now - firstOpen < TWO_YEARS_MS) {
      console.log(`  ⏭ ${sym}: ${new Date(firstOpen).toISOString().slice(0, 10)}'de listelendi — 2 yıldan yeni`);
      continue;
    }
    eligible.push({ sym, pair, name: c.name, marketCap: c.market_cap });
  }
  console.log(`${eligible.length}/${coins.length} coin 2+ yıl kriterini geçti. FVG + Sıkı-mod taraması başlıyor...`);

  const results = [];
  for (const c of eligible) {
    const rows = await binanceRecentKlines(c.pair, 1000);
    await sleep(REQUEST_DELAY_MS);
    if (!rows) { console.log(`  ⏭ ${c.sym}: kline verisi alınamadı`); continue; }
    const bars = parseKlines(rows);
    if (bars.length < 60) { console.log(`  ⏭ ${c.sym}: yetersiz bar (${bars.length})`); continue; }
    // AK-102'de kanıtlanmış desen: gerçek veri kullan, motoru DEĞİŞTİRME — Lab/Tarama ile
    // birebir aynı varsayılan parametreler (rr=2, maxGapATR=0.6, concepts=["fvg"], costR=0.05).
    const r = runBacktest(bars, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
    if (!r) { console.log(`  ⏭ ${c.sym}: backtest null döndü (yetersiz OOS işlem)`); continue; }
    results.push({
      sym: c.sym, name: c.name, marketCap: c.marketCap,
      oosTrades: r.oosTrades, winRate: r.winRate, expectancy: r.expectancy,
      tStat: r.tStat, edgeBase: r.verdict.good && r.tStat >= 2, // D19: t<2 asla "edge" sayılmaz
    });
    console.log(`  ✓ ${c.sym}: t=${r.tStat} oos=${r.oosTrades} win=${r.winRate}%`);
  }

  const N = results.length;
  const strictT = N > 0 ? bonferroniT(N) : null;
  for (const r of results) r.edgeStrict = strictT != null && r.edgeBase && r.tStat >= strictT;
  results.sort((a, b) => b.tStat - a.tStat);

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = `scripts/out/top100-fvg-scan-${stamp}.json`;
  const csvPath = `scripts/out/top100-fvg-scan-${stamp}.csv`;

  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), coinsChecked: coins.length, eligibleCount: N, strictT, results }, null, 2));
  const csvHeader = "sembol,isim,piyasa_degeri_usd,oos_islem_sayisi,kazanc_orani_pct,beklenen_R,t_istatistigi,anlamli_t2,anlamli_bonferroni\n";
  const csvBody = results.map((r) => [r.sym, r.name, r.marketCap, r.oosTrades, r.winRate, r.expectancy, r.tStat, r.edgeBase, r.edgeStrict].join(",")).join("\n");
  writeFileSync(csvPath, csvHeader + csvBody + "\n");

  console.log("\n=== ÖZET ===");
  console.log(`Taranan coin: ${coins.length} · 2+ yıl kriterini geçen: ${N}`);
  console.log(`Bonferroni eşiği (N=${N}): t ≥ ${strictT}`);
  console.log(`Standart anlamlı (t≥2, D19): ${results.filter((r) => r.edgeBase).length}`);
  console.log(`Sıkı-mod anlamlı (Bonferroni): ${results.filter((r) => r.edgeStrict).length}`);
  console.log(`Rapor: ${jsonPath}\n       ${csvPath}`);
}

main().catch((e) => { console.error("Script başarısız:", e.message); process.exit(1); });
