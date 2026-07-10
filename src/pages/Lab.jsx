import { useState, useEffect, useMemo, useRef } from "react";
import { FlaskConical, Activity, Play, Pause, SkipBack, SkipForward, RotateCcw, ShieldCheck, ShieldAlert, Search, SlidersHorizontal, Monitor, Dices, Calculator, LayoutGrid, Target, Download } from "lucide-react";
import { getBars, MARKET_GROUPS, ALL_SYMBOLS, loadReal, isReal, hasData, pairFor, tfOf, TIMEFRAMES } from "../lib/data.js";
import Chart from "../components/Chart.jsx";
import Timeline from "../components/Timeline.jsx";
import { runBacktest } from "../lib/backtest.js";
import { PANELS, BASIC, loadLayout, saveLayout } from "../lib/layout.js";
import "../styles/lab.css";
import "../styles/chart.css";

const CONCEPTS = [["fvg","FVG"],["ob","Order Block"],["bos","BOS"],["mit","Mitigation"],["of","Order Flow"],["fib","Fibonacci"]];

function Equity({ curve }) {
  if (!curve || curve.length < 2) return null;
  const w = 280, h = 60, min = Math.min(0, ...curve), max = Math.max(0, ...curve), range = max - min || 1;
  const pts = curve.map((v, i) => `${((i / (curve.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  const zeroY = h - ((0 - min) / range) * h;
  return (
    <svg className="ak-eq" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} className="ak-eq-zero" />
      <polyline points={pts} className="ak-eq-line" />
    </svg>
  );
}

export default function Lab() {
  const [group, setGroup] = useState("kripto");
  const [query, setQuery] = useState("SOL");
  const [debounced, setDebounced] = useState("SOL");
  const [symbol, setSymbol] = useState("SOL");
  const [open, setOpen] = useState(false);
  const [rr, setRr] = useState(2);
  const [gap, setGap] = useState(0.6);   // gelişmiş: FVG boşluk eşiği (×ATR)
  const [cost, setCost] = useState(0.05); // gelişmiş: işlem maliyeti (R) — komisyon+slippage
  const [stopM, setStopM] = useState(1);   // gelişmiş: stop genişliği (×ATR)
  const [logS, setLogS] = useState(false); // grafik: log ölçek
  const [tf, setTf] = useState("4h");       // zaman dilimi (yalnız gerçek-veri sembolleri)
  const [lay, setLay] = useState(loadLayout);   // AK-022: panel görünürlüğü (kalıcı)
  const [viewOpen, setViewOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);   // AK-026: göstergeler menüsü (çipler açıkta değil)
  function setPanel(k, v) { setLay(L => { const n = { ...L, [k]: v }; saveLayout(n); return n; }); }
  function resetBasic() { setLay({ ...BASIC }); saveLayout({ ...BASIC }); setViewOpen(false); }
  const [concepts, setConcepts] = useState(["fvg"]);
  const [showEma, setShowEma] = useState(true);
  const [win, setWin] = useState({ s: 0.84, e: 1 });
  const [lanes, setLanes] = useState(["liq"]);
  const [lanesOn, setLanesOn] = useState(true);
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(280);
  const [rAcc, setRAcc] = useState(1000);
  const [rPct, setRPct] = useState(1);
  const [rEntry, setREntry] = useState(100);
  const [rStop, setRStop] = useState(98);
  const [chartType, setChartType] = useState("candle"); // AK-044: mum/çizgi/alan/heikin-ashi
  const [drawMode, setDrawMode] = useState(null);        // AK-044: null | "trendline" | "rect"
  const [cmpOpen, setCmpOpen] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState(null);
  const [compareQuery, setCompareQuery] = useState("");
  const [, setCmpDataV] = useState(0);

  const _bars = getBars(symbol);
  const _N = _bars.length;
  const winStart = Math.floor(win.s * _N);
  const winEnd = Math.max(winStart + 12, Math.ceil(win.e * _N) - 1);
  const chartRange = replay
    ? { start: winStart, end: Math.min(Math.max(cursor, winStart + 4), winEnd) }
    : { start: winStart, end: winEnd };

  useEffect(() => {
    if (!replay || !playing) return;
    const id = setInterval(() => {
      setCursor(c => { const end = Math.min(winEnd, _N - 1); if (c >= end) { setPlaying(false); return c; } return c + 1; });
    }, speed);
    return () => clearInterval(id);
  }, [replay, playing, speed, winEnd]);

  function toggleReplay() {
    const ns = !replay;
    setReplay(ns);
    if (ns) { setCursor(winStart + Math.min(30, Math.floor((winEnd - winStart) / 3))); setPlaying(false); }
    else setPlaying(false);
  }
  // Replay TAHMİN MODU (pratik — sicile sayılmaz): duraklat, yön seç, replay çözer.
  const [pred, setPred] = useState(null);            // aktif tahmin {dir, entry, stop, target, startIdx}
  const [predMsg, setPredMsg] = useState(null);      // son sonuç mesajı
  const [tally, setTally] = useState({ n: 0, win: 0, netR: 0 });

  function makePred(dir) {
    const i = chartRange.end;
    const b = _bars[i];
    // basit ATR14 (h-l ortalaması) — stop mesafesi
    let a = 0, c = 0;
    for (let j = Math.max(1, i - 13); j <= i; j++) { a += _bars[j].h - _bars[j].l; c++; }
    const atr1 = a / Math.max(1, c);
    const entry = b.c;
    const stop = dir === 1 ? entry - atr1 : entry + atr1;
    const target = dir === 1 ? entry + 2 * atr1 : entry - 2 * atr1; // sabit 1:2
    setPred({ dir, entry, stop, target, startIdx: i });
    setPredMsg(null);
    setPlaying(true); // tahmin verildi, piyasa aksın
  }

  useEffect(() => {
    if (!pred || cursor <= pred.startIdx) return;
    const b = _bars[cursor];
    if (!b) return;
    const hitStop = pred.dir === 1 ? b.l <= pred.stop : b.h >= pred.stop;
    const hitTarget = pred.dir === 1 ? b.h >= pred.target : b.l <= pred.target;
    let out = null;
    if (hitStop) out = -1;            // stop önce (motorla aynı tutucu varsayım)
    else if (hitTarget) out = 2;
    else if (cursor >= winEnd) { setPred(null); setPredMsg("Pencere bitti — tahmin sayılmadı."); return; }
    if (out !== null) {
      setTally(t => ({ n: t.n + 1, win: t.win + (out > 0 ? 1 : 0), netR: Math.round((t.netR + out) * 10) / 10 }));
      setPredMsg(out > 0 ? "✓ Doğru — +2R" : "✗ Stop — −1R");
      setPred(null);
      setPlaying(false);
    }
  }, [cursor]); // eslint-disable-line

  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setDataV] = useState(0); // gerçek veri gelince yeniden çizim tetikler
  const boxRef = useRef(null);
  const chartRef = useRef(null); // AK-047: yer imi imperative handle (goToBookmark)

  // AK-004b: kripto sembollerinde gerçek Binance verisini arka planda yükle
  useEffect(() => {
    let on = true;
    setRes(null);
    loadReal(symbol, tf).then((b) => { if (on) setDataV(v => v + 1); });
    return () => { on = false; };
  }, [symbol, tf]);
  const dataOk = hasData(symbol); // ne gerçek ne tanımlı sentetik yoksa grafik/backtest kilitli (sahte veri YASAK)

  // AK-044: karşılaştırma sembolü için de gerçek veriyi arka planda yükle
  useEffect(() => {
    if (!compareSymbol) return;
    let on = true;
    loadReal(compareSymbol, tf).then(() => { if (on) setCmpDataV(v => v + 1); });
    return () => { on = false; };
  }, [compareSymbol, tf]);

  // akıllı tamamlama: yazdıktan ~1.5sn sonra öneriler
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300); // standart ~300ms
    return () => clearTimeout(id);
  }, [query]);

  const suggestions = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return ALL_SYMBOLS.slice(0, 6);
    return ALL_SYMBOLS.filter((s) => s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [debounced]);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s) { setSymbol(s.sym); setQuery(s.sym); setDebounced(s.sym); setOpen(false); setRes(null); }

  function downloadChartPNG() {
    const svg = document.getElementById("ak-main-chart");
    if (!svg) return;
    let svgStr = new XMLSerializer().serializeToString(svg);
    if (!svgStr.includes("xmlns=")) svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const rect = svg.getBoundingClientRect();
    const scale = 2;
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0E1416";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `altinkulak_${symbol}_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  }

  function run() {
    if (!hasData(symbol)) return; // veri yokken sahte backtest yok
    setBusy(true);
    setTimeout(() => { setRes(runBacktest(getBars(symbol), { rr: Number(rr) || 2, maxGapATR: Number(gap) || 0.6, concepts, costR: Number(cost) || 0, stopMult: Number(stopM) || 1 })); setBusy(false); }, 120);
  }

  return (
    <div className="ak-lab">
      <div className="ak-lab-head">
        <span className="ak-eyebrow">STRATEJİ LABORATUVARI</span>
        <h1>Kur, test et — istatistik yalan söylemez.</h1>
        <p className="ak-lab-lead">
          Lookahead-bias engelli, 70/30 train/test, rastgele giriş kontrol grubuyla. Sonuç sadece kazanç eğrisi değil; out-of-sample t-istatistiğiyle <b>ne kadar güvenilir</b> onu da söyler.
        </p>
        <span className="ak-deskonly"><Monitor size={13} /> Tam strateji kurulumu masaüstü içindir. Telefonda izleme + hızlı test sunulur.</span>
      </div>

      <div className="ak-chartwrap">
        <div className="ak-cfilter">
          <div className="ak-view">
            <button className={"ak-cchip" + (indOpen ? " on" : "")} onClick={() => setIndOpen(v => !v)}><Activity size={12} /> Göstergeler{concepts.length ? ` (${concepts.length})` : ""}</button>
            {indOpen && (
              <div className="ak-view-menu">
                {CONCEPTS.map(([k, l]) => (
                  <label key={k}><input type="checkbox" checked={concepts.includes(k)} onChange={() => setConcepts(c => c.includes(k) ? c.filter(z => z !== k) : [...c, k])} /> {l}</label>
                ))}
                <label><input type="checkbox" checked={showEma} onChange={() => setShowEma(v => !v)} /> EMA 20</label>
                <label><input type="checkbox" checked={lanesOn} onChange={() => setLanesOn(v => !v)} /> Zaman şeridi katmanları</label>
              </div>
            )}
          </div>
          <button className={"ak-cchip teal" + (replay ? " on" : "")} onClick={toggleReplay}>Replay</button>
          <div className="ak-tf">
            {[["candle", "Mum"], ["line", "Çizgi"], ["area", "Alan"], ["heikinashi", "Heikin-Ashi"]].map(([k, l]) => (
              <button key={k} className={chartType === k ? "on" : ""} onClick={() => setChartType(k)}>{l}</button>
            ))}
          </div>
          <button className={"ak-cchip" + (drawMode === "trendline" ? " on" : "")} onClick={() => setDrawMode(m => m === "trendline" ? null : "trendline")}>Trend Çizgisi</button>
          <button className={"ak-cchip" + (drawMode === "rect" ? " on" : "")} onClick={() => setDrawMode(m => m === "rect" ? null : "rect")}>Dikdörtgen</button>
          <div className="ak-view">
            <button className={"ak-cchip teal" + (compareOn && compareSymbol ? " on" : "")} onClick={() => setCmpOpen(v => !v)}>Karşılaştır{compareOn && compareSymbol ? ` (${compareSymbol})` : ""}</button>
            {cmpOpen && (
              <div className="ak-view-menu">
                <input type="text" placeholder="Sembol (örn. ETH)" value={compareQuery} spellCheck={false}
                  onChange={(e) => setCompareQuery(e.target.value)} className="ak-cmp-in" />
                <button className="ak-view-basic" onClick={() => {
                  const s = compareQuery.trim().toUpperCase();
                  if (!s) return;
                  setCompareSymbol(s); setCompareOn(true); setCmpOpen(false);
                }}>Ekle</button>
                {compareSymbol && (
                  <button className="ak-view-basic" onClick={() => { setCompareOn(false); setCompareSymbol(null); setCompareQuery(""); setCmpOpen(false); }}>Kaldır</button>
                )}
              </div>
            )}
          </div>
          <div className="ak-view">
            <button className={"ak-cchip" + (viewOpen ? " on" : "")} onClick={() => setViewOpen(v => !v)}><LayoutGrid size={12} /> Görünüm</button>
            {viewOpen && (
              <div className="ak-view-menu">
                {PANELS.map(pn => (
                  <label key={pn.k}><input type="checkbox" checked={!!lay[pn.k]} onChange={e => setPanel(pn.k, e.target.checked)} /> {pn.label}</label>
                ))}
                <button className="ak-view-basic" onClick={resetBasic}>Temel (varsayılana dön)</button>
              </div>
            )}
          </div>
          {pairFor(symbol) && (
            <div className="ak-tf">
              {TIMEFRAMES.map(([k, l]) => (
                <button key={k} className={tf === k ? "on" : ""} onClick={() => setTf(k)}>{l}</button>
              ))}
            </div>
          )}
          <div className="ak-tf ak-tf-gold">
            <button onClick={() => chartRef.current?.goToBookmark()} title="Alt+tık ile sarı yer imi koy, buraya bas ya da işarete çift tıkla dön">◆ İşarete dön</button>
          </div>
          <span className={"ak-datasrc" + (isReal(symbol) ? " real" : "")}>
            {isReal(symbol) ? `● GERÇEK VERİ · Binance ${(TIMEFRAMES.find(x => x[0] === tfOf(symbol)) || ["", "4s"])[1]}` : "○ örnek veri"}
          </span>
        </div>
        {!dataOk && (
          <div className="ak-nodata">
            <b>{symbol}</b> için veri bekleniyor… Binance'te {symbol}USDT deneniyor; bulunamazsa burada açıkça söylenir — başka sembolün örnek verisi ASLA gösterilmez.
          </div>
        )}
        {dataOk && <Chart ref={chartRef} bars={getBars(symbol)} concepts={concepts} showEma={showEma} trades={replay ? null : res?.trades} logScale={logS} range={chartRange} onRangeSelect={replay ? null : ((gs, ge) => { const N = getBars(symbol).length; if (gs == null) { setWin({ s: 0, e: 1 }); } else { setWin({ s: gs / (N - 1), e: ge / (N - 1) }); } })} chartType={chartType} symbol={symbol} drawMode={drawMode} compareBars={compareOn && compareSymbol && hasData(compareSymbol) ? getBars(compareSymbol) : null} />}
        {replay && (
          <div className="ak-replay">
            <button className="ak-rp" onClick={() => setCursor(c => Math.max(winStart + 4, c - 1))} title="Geri"><SkipBack size={15} /></button>
            <button className="ak-rp play" onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="ak-rp" onClick={() => setCursor(c => Math.min(Math.min(winEnd, _N - 1), c + 1))} title="İleri"><SkipForward size={15} /></button>
            <div className="ak-rp-prog"><div style={{ width: `${((cursor - winStart) / Math.max(1, winEnd - winStart)) * 100}%` }} /></div>
            <div className="ak-rp-speed">{[[1, 280], [2, 140], [4, 70]].map(([x, ms]) => <button key={x} className={speed === ms ? "on" : ""} onClick={() => setSpeed(ms)}>{x}x</button>)}</div>
            <button className="ak-rp txt" onClick={() => { setCursor(winStart + Math.min(30, Math.floor((winEnd - winStart) / 3))); setPlaying(false); }}><RotateCcw size={13} /> Sıfırla</button>
          </div>
        )}
        {replay && (
          <div className="ak-pred">
            <span className="ak-pred-t"><Target size={13} /> Tahmin modu <em>pratik — sicile sayılmaz · sabit 1:2</em></span>
            {!pred ? (
              <>
                <button className="ak-pred-btn long" onClick={() => makePred(1)}>Long</button>
                <button className="ak-pred-btn short" onClick={() => makePred(-1)}>Short</button>
              </>
            ) : (
              <span className="ak-pred-live">{pred.dir === 1 ? "LONG" : "SHORT"} @ {pred.entry.toFixed(2)} · SL {pred.stop.toFixed(2)} · TP {pred.target.toFixed(2)} — sürüyor…</span>
            )}
            {predMsg && <span className={"ak-pred-msg" + (predMsg.startsWith("✓") ? " ok" : "")}>{predMsg}</span>}
            {tally.n > 0 && <span className="ak-pred-score">{tally.n} tahmin · {tally.win} isabet · {tally.netR >= 0 ? "+" : ""}{tally.netR}R</span>}
          </div>
        )}
        <div className="ak-ranges">
          <button className={logS ? "on" : ""} title="Logaritmik fiyat ölçeği" onClick={() => setLogS(v => !v)}>Log</button>
          <span className="ak-ranges-sep" />
          <button title="Uzaklaş (daha çok bar)" onClick={() => setWin(w => { const sp = Math.min(1, (w.e - w.s) * 1.5); return { s: Math.max(0, w.e - sp), e: w.e }; })}>−</button>
          <button title="Yakınlaş (daha az bar)" onClick={() => setWin(w => { const sp = Math.max(0.04, (w.e - w.s) / 1.5); return { s: Math.max(0, w.e - sp), e: w.e }; })}>+</button>
          <span className="ak-ranges-sep" />
          {[["14G", 84], ["1A", 180], ["3A", 540], ["Tümü", 900]].map(([lb, nb]) => (
            <button key={lb} onClick={() => { setWin({ s: Math.max(0, 1 - nb / 900), e: 1 }); }}>{lb}</button>
          ))}
          <span className="ak-ranges-sep" />
          <button title="Grafiği PNG olarak indir" onClick={downloadChartPNG}><Download size={12} /> PNG</button>
        </div>
        {lay.timeline && <Timeline bars={getBars(symbol)} win={win} onChange={setWin}
          lanes={lanes} lanesOn={lanesOn}
          onToggleLane={(k) => setLanes(l => l.includes(k) ? l.filter(z => z !== k) : [...l, k])} />}
      </div>

      <div className="ak-lab-grid">
        <div className="ak-panel">
          <h2><FlaskConical size={17} /> Strateji</h2>

          <div className="ak-row"><label>Piyasa</label>
            <div className="ak-pill">{MARKET_GROUPS.map((g) =>
              <button key={g.key} className={group === g.key ? "on" : ""}
                onClick={() => { setGroup(g.key); pick({ sym: g.symbols[0] }); }}>{g.label}</button>)}
            </div>
          </div>

          {/* Sembol: arama + akıllı tamamlama */}
          <div className="ak-row ak-row-top"><label>Sembol</label>
            <div className="ak-search" ref={boxRef}>
              <div className="ak-search-in">
                <Search size={15} />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)} placeholder="Sembol ara (örn. SOL, ASELS, NVDA)" spellCheck={false} />
              </div>
              {open && (suggestions.length > 0 || (query.trim() && pairFor(query.trim()))) && (
                <div className="ak-sug">
                  {suggestions.map((s) => (
                    <button key={s.sym} onClick={() => pick(s)}>
                      <b>{s.sym}</b><span>{s.name}</span><em>{s.group}</em>
                    </button>
                  ))}
                  {suggestions.length === 0 && query.trim() && pairFor(query.trim()) && (
                    <button onClick={() => pick({ sym: query.trim().toUpperCase() })}>
                      <b>{query.trim().toUpperCase()}</b><span>listede yok — Binance'te dene</span><em>Kripto</em>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ak-active-sym">Seçili: <b>{symbol}</b></div>

          {/* Risk:Ödül serbest giriş */}
          <div className="ak-row"><label>Risk : Ödül</label>
            <div className="ak-rr">1 : <input type="number" min="1" step="0.5" value={rr} onChange={(e) => { setRr(e.target.value); setRes(null); }} /></div>
          </div>

          {/* Gelişmiş: kendi sistemini uzat */}
          <button className="ak-adv-toggle" onClick={() => setPanel("adv", !lay.adv)}>
            <SlidersHorizontal size={14} /> Kendi sistemin (gelişmiş) {lay.adv ? "▲" : "▼"}
          </button>
          {lay.adv && (
            <div className="ak-adv">
              <div className="ak-row"><label>FVG boşluk eşiği (×ATR)</label>
                <div className="ak-rr"><input type="number" min="0.2" max="1.2" step="0.1" value={gap} onChange={(e) => { setGap(e.target.value); setRes(null); }} /></div>
              </div>
              <div className="ak-row"><label>Stop genişliği (×ATR)</label>
                <div className="ak-rr"><input type="number" min="0.5" max="3" step="0.25" value={stopM} onChange={(e) => { setStopM(e.target.value); setRes(null); }} /></div>
              </div>
              <div className="ak-row"><label>İşlem maliyeti (R)</label>
                <div className="ak-rr"><input type="number" min="0" max="0.5" step="0.01" value={cost} onChange={(e) => { setCost(e.target.value); setRes(null); }} /></div>
              </div>
              <p className="ak-note">Dar boşluk = daha seçici. Araştırmamız edge’in dar + trend yönlü boşlukta yaşadığını gösterdi. İşlem maliyeti (komisyon + slippage) her işlemden düşülür — rastgele kontrol grubu da aynı maliyeti öder; 0.05 = riskin %5'i. Maliyetsiz backtest kendini kandırmaktır.</p>
            </div>
          )}

          <button className="ak-btn ak-btn-primary ak-run" onClick={run} disabled={busy}>
            <Play size={16} /> {busy ? "Çalışıyor…" : "Backtest çalıştır"}
          </button>

          <button className="ak-adv-toggle" onClick={() => setPanel("risk", !lay.risk)}>
            <Calculator size={14} /> Pozisyon & risk hesaplayıcı {lay.risk ? "▲" : "▼"}
          </button>
          {lay.risk && (() => {
            const acc = Number(rAcc) || 0, rp = Number(rPct) || 0, en = Number(rEntry) || 0, st = Number(rStop) || 0;
            const perUnit = Math.abs(en - st);
            const riskAmt = acc * rp / 100;
            const size = perUnit > 0 ? riskAmt / perUnit : 0;
            const posVal = size * en;
            const expVal = res ? res.expectancy * riskAmt : null;
            return (
              <div className="ak-adv ak-risk">
                <div className="ak-risk-in">
                  <label>Hesap ($)<input type="number" value={rAcc} onChange={e => setRAcc(e.target.value)} /></label>
                  <label>Risk %<input type="number" step="0.5" value={rPct} onChange={e => setRPct(e.target.value)} /></label>
                  <label>Giriş<input type="number" value={rEntry} onChange={e => setREntry(e.target.value)} /></label>
                  <label>Stop<input type="number" value={rStop} onChange={e => setRStop(e.target.value)} /></label>
                </div>
                <div className="ak-risk-out">
                  <div><b>{size ? size.toFixed(4) : "—"}</b><span>pozisyon (adet)</span></div>
                  <div><b>${riskAmt.toFixed(0)}</b><span>riske attığın (1R)</span></div>
                  <div><b>${posVal ? posVal.toFixed(0) : "—"}</b><span>pozisyon değeri</span></div>
                </div>
                {expVal !== null && <p className="ak-note">Bu sembolün beklenen değeriyle (×{res.expectancy}R/işlem) işlem başına teorik beklenti: <b style={{ color: expVal >= 0 ? "var(--good)" : "var(--bad)" }}>{expVal >= 0 ? "+" : ""}${expVal.toFixed(1)}</b>. Geçmiş ≠ gelecek; risk yönetimi şart.</p>}
              </div>
            );
          })()}
        </div>

        <div className="ak-panel">
          <h2><Activity size={17} /> Sonuç {res && <span className="ak-res-ctx">{symbol} · 1:{rr}</span>}</h2>
          {!res && <p className="ak-hint">Sembolü ara, parametreni ayarla, “Backtest çalıştır”a bas. İpucu: <b>SOL</b> ile <b>RND</b>’yi karşılaştır.</p>}
          {res && (
            <>
              <div className="ak-metrics">
                <div className="ak-metric"><div className="v">{res.winRate}%</div><div className="k">Kazanç oranı</div></div>
                <div className="ak-metric"><div className="v">{res.oosTrades}</div><div className="k">OOS işlem</div></div>
                <div className="ak-metric"><div className="v">{res.maxDD}R</div><div className="k">Max drawdown</div></div>
                <div className="ak-metric"><div className={"v " + (res.expectancy > 0 ? "ok" : "no")}>{res.expectancy > 0 ? "+" : ""}{res.expectancy}R</div><div className="k">Beklenen değer</div></div>
                <div className="ak-metric"><div className="v">{res.profitFactor}</div><div className="k">Profit factor</div></div>
              </div>
              <Equity curve={res.curve} />
              <div className={"ak-verdict " + (res.verdict.good ? "good" : "bad")}>
                <div className="vt">{res.verdict.good ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                  {res.verdict.good ? `Anlamlı edge — t = ${res.tStat}` : `Edge yok — t = ${res.tStat}`}</div>
                <div className="vd">{res.verdict.reason} Rastgele giriş kontrol %95 eşiği: t = {res.controlP95}.{res.verdict.good && " Yine de canlı forward test şart."}</div>
              </div>
              {lay.mc && res.mc && (
                <div className="ak-mc">
                  <div className="ak-mc-head"><Dices size={14} /> İleri simülasyon (1000× karıştırma) — tek eğriye güvenme</div>
                  <div className="ak-mc-grid">
                    <div><span className="ak-mc-v">{res.mc.medianR > 0 ? "+" : ""}{res.mc.medianR}R</span><span className="ak-mc-k">medyan sonuç</span></div>
                    <div><span className={"ak-mc-v " + (res.mc.p05R < 0 ? "no" : "")}>{res.mc.p05R > 0 ? "+" : ""}{res.mc.p05R}R</span><span className="ak-mc-k">kötü %5 senaryo</span></div>
                    <div><span className="ak-mc-v">{res.mc.worstDD}R</span><span className="ak-mc-k">en kötü drawdown</span></div>
                    <div><span className={"ak-mc-v " + (res.mc.negPct > 0 ? "no" : "ok")}>%{res.mc.negPct}</span><span className="ak-mc-k">zararla biten</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
