import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FlaskConical, Code2, Activity, Play, Pause, SkipBack, SkipForward, RotateCcw, ShieldCheck, ShieldAlert, Search, SlidersHorizontal, Monitor, Dices, Calculator, LayoutGrid, Target, Download, PenTool, ChevronLeft, ChevronRight, Film, Maximize2, X } from "lucide-react";
import { getBars, MARKET_GROUPS, ALL_SYMBOLS, loadReal, isReal, hasData, pairFor, tfOf, TIMEFRAMES, stats24h } from "../lib/data.js";
import { atr } from "../lib/detectors.js";
import { subscribe as subscribeLive } from "../lib/liveData.js";
import Chart from "../components/Chart.jsx";
import Timeline from "../components/Timeline.jsx";
import SistemimKoduPanel from "../components/SistemimKoduPanel.jsx";
import StrategyExtractor from "../components/StrategyExtractor.jsx";
import { runBacktest, simulateOutcome, randomEntryControl, monteCarlo } from "../lib/backtest.js";
import { tStat, verdict, sharpeLike, trainTestSplit } from "../lib/stats.js";
import { runUserCode, runUserCodeWalkForward } from "../lib/sandboxRunner.js";
import { extractParams, upsertParams, ratiosFromLevels } from "../lib/paramsBlock.js";
import { rangeFromIndices, hypothesisStatus } from "../lib/strategyExtractor.js";
import { addSandbox } from "../lib/sandbox.js";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { createUndoStack, bindUndoHotkeys } from "../lib/undoStack.js";
import { PANELS, BASIC, loadLayout, saveLayout } from "../lib/layout.js";
import { exitPlan } from "../lib/fullscreenExit.js";
import "../styles/lab.css";
import "../styles/chart.css";
import "../styles/kodeditoru.css";

const FAV_KEY = "ak_favorites_v1"; // AK-061: Izleme.jsx ile paylaşılan aynı anahtar
function loadFavorites() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); } }

const CONCEPTS = [["fvg","FVG"],["ob","Order Block"],["bos","BOS"],["mit","Mitigation"],["of","Order Flow"],["fib","Fibonacci"]];

// AK-050: MA20/50/200 sabit renkleri — CSS değişkenleri üzerinden (sabit hex yazılmaz).
// 20 mevcut .ak-c-ema turkuazında kalır (varsayılan görünüm eskisiyle birebir aynı olsun diye).
const MA_COLORS = { 20: "var(--teal)", 50: "var(--ma-purple)", 200: "var(--teal-soft)" };

// AK-068: concepts/showEma/maList/showRsi dağınık state'i tek indicators=[{id,type,label,enabled,shown,params}]
// listesine birleştirildi. enabled = eski checkbox durumu (Göstergeler menüsü hâlâ bunu okur/yazar — geriye
// uyumlu). shown = legend'daki göz ikonuyla geçici gizleme; yalnız grafiği etkiler, backtest'i etkilemez.
const DEFAULT_INDICATORS = [
  ...CONCEPTS.map(([id, label]) => ({ id, type: "concept", label, enabled: id === "fvg", shown: true, params: {} })),
  { id: "ma20", type: "ma", label: "MA 20", enabled: true, shown: true, params: { period: 20, color: MA_COLORS[20] } },
  { id: "ma50", type: "ma", label: "MA 50", enabled: false, shown: true, params: { period: 50, color: MA_COLORS[50] } },
  { id: "ma200", type: "ma", label: "MA 200", enabled: false, shown: true, params: { period: 200, color: MA_COLORS[200] } },
  { id: "maCustom", type: "ma", label: "Özel MA", enabled: false, shown: true, params: { period: null, color: "var(--sage)" }, showPeriodInLabel: true },
  { id: "rsi", type: "rsi", label: "RSI (14)", enabled: false, shown: true, params: { period: 14 } },
];

// AK-051: 24s Y/D/Hacim şeridi için kompakt biçimlendiriciler (Chart.jsx'teki fmtP ile tutarlı)
function fmtP(p) {
  if (!Number.isFinite(p)) return "";
  const a = Math.abs(p);
  if (a >= 10000) return Math.round(p).toLocaleString("en-US");
  if (a >= 1000) return p.toFixed(0);
  if (a >= 100) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}
function fmtVol(v) {
  if (!Number.isFinite(v)) return "";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}

// AK-073: "Kendi Kodum" — kullanıcının mySignal(bars,helpers) çıktısını (ham {i,dir,entry,stop,hedef1,hedef2}
// sinyal listesi) simulateOutcome ile gerçek işleme çevirir. hedef1 birincil hedeftir (karar: hedef2 outcome'a girmez).
function simulateSignals(bars, signals, lookahead = 40) {
  const trades = [];
  for (const s of signals || []) {
    if (!s || typeof s !== "object") continue;
    if (s.dir !== 1 && s.dir !== -1) continue;
    if (!Number.isFinite(s.entry) || !Number.isFinite(s.stop) || !Number.isFinite(s.hedef1)) continue;
    const entryIdx = Number.isInteger(s.i) ? s.i : Math.round(s.i);
    if (!Number.isInteger(entryIdx) || entryIdx < 0 || entryIdx >= bars.length) continue;
    const { outcome } = simulateOutcome(bars, entryIdx, s.dir, s.entry, s.stop, s.hedef1, lookahead);
    if (outcome != null) trades.push({ entryIdx, dir: s.dir, entry: s.entry, stop: s.stop, target: s.hedef1, outcome });
  }
  return trades;
}

// runBacktest() ile AYNI istatistik şeklini (trades/winRate/tStat/controlP95/verdict/mc/curve...) üretir —
// Sonuç paneli ve Chart'ın trades prop'u hangi kaynaktan geldiğine bakmaksızın aynı şekilde çalışır.
// Kullanıcı kodunda tek sabit bir R:R yoktur (her sinyal kendi hedef1/stop'unu belirler); kontrol grubu
// için gözlemlenen ortalama kazanç R'si kullanılır (adil kıyas, bilinmeyen rr için makul yaklaşım).
function buildCodeStats(bars, allSignals, testBars, testSignals) {
  const allSim = simulateSignals(bars, allSignals);
  const testSim = simulateSignals(testBars, testSignals);
  const allR = allSim.map((t) => t.outcome);
  const testR = testSim.map((t) => t.outcome);
  const winsArr = allR.filter((x) => x > 0), lossArr = allR.filter((x) => x < 0);
  const winRate = allR.length ? Math.round((winsArr.length / allR.length) * 100) : 0;
  const expectancy = allR.length ? allR.reduce((a, x) => a + x, 0) / allR.length : 0;
  const grossWin = winsArr.reduce((a, x) => a + x, 0), grossLoss = Math.abs(lossArr.reduce((a, x) => a + x, 0));
  const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  const avgWin = winsArr.length ? grossWin / winsArr.length : 0;
  const avgLoss = lossArr.length ? grossLoss / lossArr.length : 0;

  let eq = 0, peak = 0, maxDD = 0;
  const curve = [];
  for (const r of allR) { eq += r; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq); curve.push(eq); }

  const tOOS = tStat(testR);
  const avgRR = winsArr.length ? winsArr.reduce((a, x) => a + x, 0) / winsArr.length : 2;
  const atrArr = atr(testBars, 14);
  const control = randomEntryControl(testBars, atrArr, avgRR, Math.max(testR.length, 2), 40, 300, 777, 0, 1);
  const v = verdict(tOOS, control);

  return {
    trades: allSim,
    costR: 0,
    tradeCount: allSim.length,
    oosTrades: testSim.length,
    winRate,
    maxDD: Math.round(maxDD * 10) / 10,
    tStat: Math.round(tOOS * 10) / 10,
    controlP95: Math.round(control.p95 * 10) / 10,
    sharpe: Math.round(sharpeLike(allR) * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    mc: monteCarlo(allR),
    curve,
    verdict: v,
  };
}

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
  const { requireAuth } = useAuthGate();
  const [group, setGroup] = useState("kripto");
  const [query, setQuery] = useState("SOL");
  const [debounced, setDebounced] = useState("SOL");
  const [symbol, setSymbol] = useState("SOL");
  const [open, setOpen] = useState(false);
  const [favorites] = useState(loadFavorites); // AK-061: sembol seçicide favorileri üstte grupla (salt-okunur — işaretleme Izleme.jsx'te)
  const [rr, setRr] = useState(2);
  const [gap, setGap] = useState(0.6);   // gelişmiş: FVG boşluk eşiği (×ATR)
  const [cost, setCost] = useState(0.05); // gelişmiş: işlem maliyeti (R) — komisyon+slippage
  const [stopM, setStopM] = useState(1);   // gelişmiş: stop genişliği (×ATR)
  const [logS, setLogS] = useState(false); // grafik: log ölçek
  const [magnetOn, setMagnetOn] = useState(true); // AK-069: rapor şikayeti — mıknatıs artık kapatılabilir (varsayılan açık)
  const [tf, setTf] = useState("4h");       // zaman dilimi (yalnız gerçek-veri sembolleri)
  const [lay, setLay] = useState(loadLayout);   // AK-022: panel görünürlüğü (kalıcı)
  // AK-082 C1/C3: dağınık araç çipleri (Göstergeler/Karşılaştır/Görünüm/çizim) tek dikey side
  // toolbar'a taşındı — indOpen/viewOpen/cmpOpen ayrı boolean'ları yerine TEK activeTool state'i
  // (null | "draw" | "strategy" | "indicators" | "view"). Panel içerikleri ve altta yatan
  // fonksiyonlar (setIndEnabled, setDrawMode, toggleReplay, setPanel...) DEĞİŞMEDİ — yalnız
  // hangi state hangi paneli açık tuttuğu değişti.
  const [activeTool, setActiveTool] = useState(null);
  const railRef = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (activeTool && railRef.current && !railRef.current.contains(e.target)) setActiveTool(null); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [activeTool]);
  function setPanel(k, v) { setLay(L => { const n = { ...L, [k]: v }; saveLayout(n); return n; }); }
  function resetBasic() { setLay({ ...BASIC }); saveLayout({ ...BASIC }); setActiveTool(null); }
  // AK-068: bkz. DEFAULT_INDICATORS yorumu — tek liste, iki türetilmiş görünüm (concepts=backtest, chartConcepts=grafik)
  const [indicators, setIndicators] = useState(DEFAULT_INDICATORS);
  const indById = useMemo(() => Object.fromEntries(indicators.map(x => [x.id, x])), [indicators]);
  function setIndEnabled(id, val) {
    setIndicators(arr => arr.map(x => x.id === id ? { ...x, enabled: val, shown: val ? true : x.shown } : x));
  }
  function toggleIndEnabled(id) { setIndEnabled(id, !indById[id]?.enabled); }
  // AK-085-TAMAMLAMA/C2: boş-alan menüsünün "Göstergeleri Kaldır" kalemi — setIndEnabled zaten
  // var, yalnız hepsine uygulanır (yeni bir mantık değil, mevcut fonksiyonun toplu çağrısı).
  function disableAllIndicators() { setIndicators(arr => arr.map(x => x.enabled ? { ...x, enabled: false } : x)); }
  function toggleIndShown(id) { setIndicators(arr => arr.map(x => x.id === id ? { ...x, shown: !x.shown } : x)); }
  function setIndParam(id, patch) { setIndicators(arr => arr.map(x => x.id === id ? { ...x, params: { ...x.params, ...patch } } : x)); }
  const [lastRemovedInd, setLastRemovedInd] = useState(null); // {id,label} — AK-068 basit tek-adım geri al (toast)
  // AK-069: genel undo/redo yığını — hem çizim silme (Chart.jsx) hem gösterge kaldırma (burada) aynı
  // örneği paylaşır; Ctrl+Z/Ctrl+Y tek bir zaman çizelgesinde geri/ileri alır (max 30 adım).
  const undoStackRef = useRef(null);
  if (!undoStackRef.current) undoStackRef.current = createUndoStack(30);
  useEffect(() => bindUndoHotkeys(undoStackRef), []);
  function removeIndicator(id) {
    const cur = indById[id];
    if (!cur) return;
    setIndEnabled(id, false);
    setLastRemovedInd({ id, label: cur.label });
    setTimeout(() => setLastRemovedInd(lr => (lr && lr.id === id ? null : lr)), 4000);
    undoStackRef.current.push({ label: "gösterge kaldırıldı", undo: () => setIndEnabled(id, true), redo: () => setIndEnabled(id, false) });
  }
  function undoRemoveIndicator() {
    if (!lastRemovedInd) return;
    setIndEnabled(lastRemovedInd.id, true);
    setLastRemovedInd(null);
  }
  // run() / runBacktest SADECE enabled'a bakar (concepts) — legend'daki göz (shown) yalnız grafiği etkiler (chartConcepts)
  const concepts = useMemo(() => indicators.filter(x => x.type === "concept" && x.enabled).map(x => x.id), [indicators]);
  const chartConcepts = useMemo(() => indicators.filter(x => x.type === "concept" && x.enabled && x.shown).map(x => x.id), [indicators]);
  const maList = useMemo(() => indicators
    .filter(x => x.type === "ma" && x.enabled && x.shown && Number.isFinite(x.params.period) && x.params.period > 1)
    .map(x => ({ period: x.params.period, color: x.params.color })), [indicators]);
  const showRsi = !!(indById.rsi?.enabled && indById.rsi?.shown);
  const legendIndicators = useMemo(() => indicators.filter(x => x.enabled), [indicators]);
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
  const [drawCount, setDrawCount] = useState(0);         // AK-052: "Tümünü Temizle" yalnız çizim varken görünür
  const [compareOn, setCompareOn] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState(null);
  const [compareQuery, setCompareQuery] = useState("");
  const [, setCmpDataV] = useState(0);
  const [paperMsg, setPaperMsg] = useState(null); // AK-058: kağıt-işlem kutusu → "sandbox'a eklendi" kısa bildirim

  // AK-058: Chart.jsx'teki kağıt-işlem kutusu (Long/Short) buraya bağlanır — grafik sandbox.js'e dokunmaz.
  function handleSandboxAdd(sym, dir, plan) {
    // AK-080 C1/C2: grafik/çizim araçları hiç kısıtlanmaz — yalnız Sandbox'a KAYDETMEK (persistence) login ister.
    if (!requireAuth("Sandbox'a kaydetmek için giriş yap.")) return;
    const e = addSandbox({ sym, dir, plan, r: 0, tag: "Plana uydu" });
    if (!e) return;
    setPaperMsg(`${sym} ${dir} · 1:${Number(plan).toFixed(1)} — Sandbox'a eklendi`);
    setTimeout(() => setPaperMsg((m) => (m === `${sym} ${dir} · 1:${Number(plan).toFixed(1)} — Sandbox'a eklendi` ? null : m)), 2500);
  }

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
  const [dataV, setDataV] = useState(0); // gerçek veri gelince yeniden çizim tetikler
  const boxRef = useRef(null);
  const chartRef = useRef(null); // AK-047: yer imi imperative handle (goToBookmark)

  // AK-092: mobil grafik tam ekran modu — TEK Chart, iki yerleşim (bu ref'i sarmalayan
  // .ak-chart-viewport CSS ile fixed-overlay'e geçer, <Chart> hiç unmount olmaz, state korunur).
  const [fullscreen, setFullscreen] = useState(false);
  const chartViewportRef = useRef(null);
  function enterFullscreen() {
    setFullscreen(true); // CSS fixed-overlay HER ZAMAN uygulanır (iOS Safari'de Fullscreen API yok)
    chartViewportRef.current?.requestFullscreen?.().catch(() => {}); // ek fayda: tarayıcı kromu da gizlenir (varsa)
  }
  function requestExitFullscreen() {
    // X/ESC/donanım geri tuşu AYNI yoldan geçer: pushState ile eklenen geçmiş girdisini
    // "geri" ile tüket — popstate fullscreen'i kapatır (Android geri tuşuyla birebir aynı davranış).
    if (exitPlan(window.history.state).goBack) window.history.back();
    else setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  useEffect(() => {
    if (!fullscreen) return;
    window.history.pushState({ akFullscreen: true }, "");
    function onPopState() { setFullscreen(false); }
    function onKeyDown(e) { if (e.key === "Escape") requestExitFullscreen(); }
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden"; // AK-081/C3 MobileMenu ile aynı desen — arkada kaymasın
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [fullscreen]); // eslint-disable-line
  // Sistem hareketiyle (ör. Android'in kendi tam ekran çıkışı) Fullscreen API'den çıkılırsa
  // state senkron kalsın — kullanıcı X'e basmadan da doğru yerde bitsin.
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) {
        setFullscreen(false);
        if (exitPlan(window.history.state).goBack) window.history.back();
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // AK-073: "Hazır Strateji" / "Kendi Kodum" sekmesi — ikisi de AYNI res state'ini besler,
  // Chart'ın trades prop'u ve Sonuç paneli kaynağa bakmaksızın aynı şekilde çalışır.
  const [stratMode, setStratMode] = useState("hazir"); // "hazir" | "kendi"
  const [codeInfo, setCodeInfo] = useState(null);        // {kind:"error"|"empty", message?} — 0 sonuç kod hatasından mı yoksa gerçekten sinyal yokluğundan mı ayrıştırır
  const codeRef = useRef("");                            // SistemimKoduPanel'deki son kod — OOS turu için
  function switchStratMode(m) {
    if (m === stratMode) return;
    setStratMode(m);
    setRes(null);
    setCodeInfo(null);
  }

  // AK-084 S1/S2: kod↔grafik PARAMS senkronu — externalCode/Version SistemimKoduPanel'e enjeksiyon
  // (C4'ten kod üretimi ya da S2'den TP sürüklemesi), flashVersion editördeki flash'ı tetikler.
  const [externalCode, setExternalCode] = useState(null);
  const [externalCodeVersion, setExternalCodeVersion] = useState(0);
  const [flashVersion, setFlashVersion] = useState(0);
  const [paramsWarn, setParamsWarn] = useState(false);
  function pushCodeToEditor(code) {
    setExternalCode(code);
    setExternalCodeVersion(v => v + 1);
    codeRef.current = code;
  }
  function handleParamsChange(params, { malformed }) {
    setParamsWarn(!!malformed);
    if (params && Number.isFinite(Number(params.tpR))) {
      chartRef.current?.applyParamsToPositionTpR(Number(params.tpR));
    }
  }
  function handlePositionDragEnd(draw) {
    const ratios = ratiosFromLevels(draw.entry, draw.sl, draw.tp);
    if (!ratios) return;
    const updated = upsertParams(codeRef.current, { tpR: ratios.tpR });
    pushCodeToEditor(updated);
    setFlashVersion(v => v + 1);
  }

  // AK-087 C1/C2: "İncele" seçimi → bar aralığı, Strateji Çıkarıcı paneli bu aralığı analiz eder.
  const [inspectRange, setInspectRange] = useState(null); // {start,end} | null
  function handleInspectRange(aI, bI) {
    setInspectRange(rangeFromIndices(aI, bI));
    setActiveTool(null);
    setDrawMode(null);
  }

  // AK-087 C4/C5: üretilen kural HİPOTEZ olarak başlar; OOS testi bitene dek etiket kalkmaz (D19).
  const [hypothesis, setHypothesis] = useState(null); // null | {tested:false} | {tested:true, verdictGood, tStat}
  const [oosBusy, setOosBusy] = useState(false);
  const [matchIncludesSweep, setMatchIncludesSweep] = useState(false);
  function handleGeneratedCode(code) {
    switchStratMode("kendi");
    pushCodeToEditor(code);
    setHypothesis({ tested: false });
    setMatchIncludesSweep(code.includes("h.findSweep"));
    setInspectRange(null);
    setRes(null);
    setCodeInfo(null);
  }
  async function runOosTest() {
    if (!hasData(symbol) || oosBusy) return;
    setOosBusy(true);
    const bars = getBars(symbol);
    const params = extractParams(codeRef.current);
    const out = await runUserCodeWalkForward(codeRef.current, bars, params);
    const signals = out.ok && Array.isArray(out.result) ? out.result.map(s => ({ ...s, hedef1: s.hedef1 ?? s.target })) : [];
    const { test } = trainTestSplit(bars, 0.7);
    const testOut = await runUserCodeWalkForward(codeRef.current, test, params);
    const testSignals = testOut.ok && Array.isArray(testOut.result) ? testOut.result.map(s => ({ ...s, hedef1: s.hedef1 ?? s.target })) : [];
    const stats = buildCodeStats(bars, signals, test, testSignals);
    setRes(stats);
    setCodeInfo(stats.tradeCount === 0 ? { kind: "empty" } : { kind: "ok" });
    setHypothesis({ tested: true, verdictGood: stats.verdict.good, tStat: stats.tStat });
    setMatchIdx(0);
    setOosBusy(false);
  }

  // AK-087 C6: Eşleşme Gezgini — dönem seçici (3ay/1yıl/tümü) sabit tam-geçmiş OOS sonucundan
  // (res.trades, her zaman TAM bars dizisine göre indekslenir) ilgili son N bar'a düşen eşleşmeleri
  // filtreler — index uzayı asla değişmez, backtest yeniden koşulmaz (basit + tutarlı).
  const [matchPeriod, setMatchPeriod] = useState("1yil"); // "3ay" | "1yil" | "tumu"
  const [matchIdx, setMatchIdx] = useState(0);
  const PERIOD_BARS = { "3ay": 540, "1yil": 2160, tumu: Infinity };
  const periodTrades = useMemo(() => {
    if (!res?.trades?.length) return [];
    const bars = getBars(symbol);
    const cutoff = Number.isFinite(PERIOD_BARS[matchPeriod]) ? bars.length - PERIOD_BARS[matchPeriod] : -1;
    return res.trades.filter(t => t.entryIdx >= cutoff);
  }, [res, matchPeriod, symbol]);
  function goToMatch(idx) {
    if (!periodTrades.length) return;
    const n = periodTrades.length;
    const clamped = ((idx % n) + n) % n;
    setMatchIdx(clamped);
    const t = periodTrades[clamped];
    const bars = getBars(symbol);
    const span = Math.max(20, Math.round(bars.length * 0.03));
    const s = Math.max(0, t.entryIdx - span), e = Math.min(bars.length - 1, t.entryIdx + span);
    setWin({ s: s / (bars.length - 1), e: e / (bars.length - 1) });
  }
  async function handleCodeRunResult(out) {
    if (!out.ok) {
      setCodeInfo({ kind: "error", message: out.error });
      setRes(null);
      return;
    }
    const signals = Array.isArray(out.result) ? out.result : [];
    const bars = getBars(symbol);
    const { test } = trainTestSplit(bars, 0.7);
    const testOut = await runUserCode(codeRef.current, test);
    const testSignals = testOut.ok && Array.isArray(testOut.result) ? testOut.result : [];
    const stats = buildCodeStats(bars, signals, test, testSignals);
    setCodeInfo(stats.tradeCount === 0 ? { kind: "empty" } : { kind: "ok" });
    setRes(stats);
  }

  // AK-072: WebSocket'ten gelen bar güncellemeleri — birden fazla tick aynı ~16ms çerçevesinde
  // gelirse rAF ile tek state güncellemesinde toplanır (gereksiz re-render patlaması önlenir).
  const [liveBars, setLiveBars] = useState(null); // null = canlı akış yok, REST barları kullanılır
  const liveRafId = useRef(null);
  const livePending = useRef(null);
  function onLiveUpdate(bars) {
    livePending.current = bars;
    if (liveRafId.current == null) {
      liveRafId.current = requestAnimationFrame(() => {
        liveRafId.current = null;
        setLiveBars(livePending.current);
      });
    }
  }

  // AK-004b: kripto sembollerinde gerçek Binance verisini arka planda yükle
  // AK-072: REST yüklemesi bitince (yalnız gerçek veride) WebSocket ile canlı akışa geçilir
  useEffect(() => {
    let on = true;
    setRes(null);
    setCodeInfo(null);
    setHypothesis(null); // yeni sembol/TF — önceki hipotez farklı veriye ait, taşınmaz
    setLiveBars(null); // yeni sembol/TF — önceki canlı veri artık geçersiz
    let unsub = null;
    loadReal(symbol, tf).then((b) => {
      if (!on) return;
      setDataV(v => v + 1);
      if (isReal(symbol)) unsub = subscribeLive(symbol, tf, getBars(symbol), onLiveUpdate);
    });
    return () => {
      on = false;
      if (unsub) unsub();
      if (liveRafId.current != null) { cancelAnimationFrame(liveRafId.current); liveRafId.current = null; }
      livePending.current = null;
    };
  }, [symbol, tf]);
  const dataOk = hasData(symbol); // ne gerçek ne tanımlı sentetik yoksa grafik/backtest kilitli (sahte veri YASAK)
  // AK-051: 24s Y/D/Hacim — yalnız gerçek veride; dataV gerçek veri gelince yeniden hesaplatır
  const stats24 = useMemo(() => (isReal(symbol) ? stats24h(getBars(symbol)) : null), [symbol, dataV]);

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

  // AK-061: favoriler ayrı bir grupta üstte — arama metniyle eşleşen tüm semboller önce favori/
  // favori-olmayan diye ikiye ayrılır, sonra favori-olmayan taraf 6 ile sınırlanır.
  const matchedSymbols = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return q ? ALL_SYMBOLS.filter((s) => s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : ALL_SYMBOLS;
  }, [debounced]);
  const favSuggestions = useMemo(() => matchedSymbols.filter((s) => favorites.has(s.sym)), [matchedSymbols, favorites]);
  const otherSuggestions = useMemo(() => matchedSymbols.filter((s) => !favorites.has(s.sym)).slice(0, 6), [matchedSymbols, favorites]);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s) { setSymbol(s.sym); setQuery(s.sym); setDebounced(s.sym); setOpen(false); setRes(null); }

  // AK-103: zoom in/out — hem normal hem tam ekran görünümünde AYNI mantık (tek yerden).
  // Önceden bu yalnız {!fullscreen && ...} bloğunda vardı; AK-092'nin "tam ekranda tüm sayfa
  // kroması gizli" kararı, mobil kullanıcıların asıl kullandığı tam ekran modunda tek zoom
  // yolunu pinch-gesture'a düşürmüştü — dokunmatik jest tanınmazsa/başarısız olursa geri dönüş
  // (buton) yoktu. Bu, "zoom çalışmıyor" şikayetinin en olası kaynağıydı.
  function zoomOut() { setWin(w => { const sp = Math.min(1, (w.e - w.s) * 1.5); return { s: Math.max(0, w.e - sp), e: w.e }; }); }
  function zoomIn() { setWin(w => { const sp = Math.max(0.04, (w.e - w.s) / 1.5); return { s: Math.max(0, w.e - sp), e: w.e }; }); }

  // AK-102: Alarm Geçmişi'nden "grafikte gör" — /lab?sym=X ile açılırsa o sembole geçilir.
  // Seviyelerin kendisi (giriş/TP/SL) Izleme.jsx tarafından zaten ak_draw_${sym}'e yazılmıştır
  // (bkz. src/lib/chartHandoff.js) — Chart.jsx symbol değişince bunu KENDİSİ okur, burada ayrıca
  // bir şey yapmaya gerek yok. Yalnız MOUNT'ta okunur — sekme içindeyken kullanıcı sembol
  // değiştirirse URL'deki eski ?sym= onu geri almaya çalışmasın.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const sym = searchParams.get("sym");
    if (sym) pick({ sym: sym.toUpperCase() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadChartPNG() {
    const svg = document.getElementById("ak-main-chart");
    if (!svg) return;
    let svgStr = new XMLSerializer().serializeToString(svg);
    if (!svgStr.includes("xmlns=")) svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const rect = svg.getBoundingClientRect();
    const scale = 2;
    const capH = 56; // AK-062: alt istatistik bandı yüksekliği (css px)
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      // AK-062: canvas metni fillText anında hazır olmayan webfont'a düşüp bozuk görünmesin
      // diye (Chakra Petch/JetBrains Mono geç yüklenebilir) önce fontların hazır olması beklenir.
      Promise.resolve(document.fonts?.ready).then(() => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width * scale;
      canvas.height = (rect.height + capH) * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0E1416";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, rect.width * scale, rect.height * scale);
      URL.revokeObjectURL(url);

      // AK-062: alt bant — sembol, t-stat, OOS, edge rozeti, karşılaştırma sembolü, marka + slogan
      const bandY = rect.height * scale, padX = 18 * scale, midY = bandY + (capH * scale) / 2;
      ctx.fillStyle = "#16201F";
      ctx.fillRect(0, bandY, canvas.width, capH * scale);
      ctx.strokeStyle = "#25322F";
      ctx.lineWidth = scale;
      ctx.beginPath(); ctx.moveTo(0, bandY); ctx.lineTo(canvas.width, bandY); ctx.stroke();

      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "#E8EEEC";
      ctx.font = `600 ${15 * scale}px "Chakra Petch", sans-serif`;
      ctx.fillText(symbol, padX, midY - 9 * scale);

      ctx.font = `500 ${11.5 * scale}px "JetBrains Mono", monospace`;
      const edgeGood = res?.verdict?.good;
      ctx.fillStyle = res ? (edgeGood ? "#4FC9A6" : "#8DA39E") : "#8DA39E";
      let stats = res
        ? `t=${res.tStat} · OOS ${res.oosTrades} işlem · ${edgeGood ? "EDGE ✓" : "edge yok"}`
        : "backtest çalıştırılmadı";
      // AK-062: karşılaştırma modu açıksa ikinci sembolün son 24s/bar değişimi de eklenir
      if (compareOn && compareSymbol && hasData(compareSymbol)) {
        const cb = getBars(compareSymbol);
        if (cb && cb.length >= 2) {
          const cLast = cb[cb.length - 1].c, cPrev = cb[cb.length - 2].c;
          const cChg = ((cLast - cPrev) / cPrev) * 100;
          stats += ` · vs ${compareSymbol} ${cChg >= 0 ? "+" : ""}${cChg.toFixed(2)}%`;
        }
      }
      ctx.fillText(stats, padX, midY + 10 * scale);

      ctx.textAlign = "right";
      ctx.fillStyle = "#E6B450";
      ctx.font = `600 ${12.5 * scale}px "JetBrains Mono", monospace`;
      ctx.fillText("samiboran.github.io/altinkulak", canvas.width - padX, midY - 9 * scale);
      ctx.fillStyle = "#8DA39E";
      ctx.font = `400 ${10.5 * scale}px "Inter", sans-serif`;
      ctx.fillText("Gürültüyü değil, sinyali duy", canvas.width - padX, midY + 10 * scale);
      ctx.textAlign = "left";

      const a = document.createElement("a");
      a.download = `altinkulak_${symbol}_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      });
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
      {!fullscreen && (
        <div className="ak-lab-head">
          <span className="ak-eyebrow">STRATEJİ LABORATUVARI</span>
          <h1>Kur, test et — istatistik yalan söylemez.</h1>
          <p className="ak-lab-lead">
            Lookahead-bias engelli, 70/30 train/test, rastgele giriş kontrol grubuyla. Sonuç sadece kazanç eğrisi değil; out-of-sample t-istatistiğiyle <b>ne kadar güvenilir</b> onu da söyler.
          </p>
          <span className="ak-deskonly"><Monitor size={13} /> Tam strateji kurulumu masaüstü içindir. Telefonda izleme + hızlı test sunulur.</span>
        </div>
      )}

      <div className="ak-chartwrap">
        {/* AK-082 C1/C3: Binance modeli dikey side toolbar — 4 grup (Çizim/Strateji araçları/
            Göstergeler/Görünüm-Karşılaştır), tek activeTool state'i ile tek panel açık kalır.
            Her chip/checkbox AYNI state ve fonksiyonlara bağlı — yalnız konumlandırma değişti. */}
        {!fullscreen && activeTool && <div className="ak-rail-veil" onClick={() => setActiveTool(null)} />}
        <div className="ak-chart-shell">
          {!fullscreen && <div className="ak-toolrail" ref={railRef}>
            <button className={"ak-rail-btn" + (activeTool === "draw" ? " on" : "")} onClick={() => setActiveTool(t => t === "draw" ? null : "draw")} title="Çizim"><PenTool size={16} /></button>
            <button className={"ak-rail-btn" + (activeTool === "strategy" ? " on" : "")} onClick={() => setActiveTool(t => t === "strategy" ? null : "strategy")} title="Strateji araçları"><Target size={16} /></button>
            <button className={"ak-rail-btn" + (activeTool === "indicators" ? " on" : "")} onClick={() => setActiveTool(t => t === "indicators" ? null : "indicators")} title="Göstergeler">
              <Activity size={16} />{concepts.length > 0 && <span className="ak-rail-badge">{concepts.length}</span>}
            </button>
            <button className={"ak-rail-btn" + (activeTool === "view" ? " on" : "")} onClick={() => setActiveTool(t => t === "view" ? null : "view")} title="Görünüm & Karşılaştır"><LayoutGrid size={16} /></button>

            {activeTool === "draw" && (
              <div className="ak-rail-panel">
                <span className="ak-rail-panel-head">Çizim</span>
                <button className={"ak-cchip" + (drawMode === "trendline" ? " on" : "")} onClick={() => setDrawMode(m => m === "trendline" ? null : "trendline")}>Trend Çizgisi</button>
                <button className={"ak-cchip" + (drawMode === "rect" ? " on" : "")} onClick={() => setDrawMode(m => m === "rect" ? null : "rect")}>Dikdörtgen</button>
                <button className={"ak-cchip" + (drawMode === "hline" ? " on" : "")} onClick={() => setDrawMode(m => m === "hline" ? null : "hline")} title="Tek tıkla tam genişlik yatay çizgi">Yatay Çizgi</button>
                <button className={"ak-cchip" + (drawMode === "hray" ? " on" : "")} onClick={() => setDrawMode(m => m === "hray" ? null : "hray")} title="Tek tıkla, tıklanan bardan sağa uzanan ışın">Yatay Işın</button>
                <button className={"ak-cchip" + (drawMode === "position" ? " on" : "")} onClick={() => setDrawMode(m => m === "position" ? null : "position")} title="Tek tıkla giriş/TP/SL kutuları eklenir, üçü de sürüklenebilir"><Target size={12} /> Pozisyon</button>
                {drawCount > 0 && <button className="ak-cchip" onClick={() => chartRef.current?.clearDraws()}>Tümünü Temizle</button>}
              </div>
            )}
            {activeTool === "strategy" && (
              <div className="ak-rail-panel">
                <span className="ak-rail-panel-head">Strateji araçları</span>
                <button className={"ak-cchip teal" + (replay ? " on" : "")} onClick={toggleReplay}>Replay{replay ? " (açık)" : ""}</button>
                <button className={"ak-cchip" + (lay.risk ? " on" : "")} onClick={() => setPanel("risk", !lay.risk)}><Calculator size={12} /> Pozisyon & Risk Hesaplayıcı {lay.risk ? "▲" : "▼"}</button>
                <button className={"ak-cchip" + (drawMode === "inspect" ? " on" : "")} onClick={() => setDrawMode(m => m === "inspect" ? null : "inspect")} title="Grafikte bir bölge seç — o aralıktaki oluşumlardan strateji kur"><Search size={12} /> İncele</button>
                <Link className="ak-cchip" to="/senaryo" title="Küratörlü senaryolarda giriş/çıkış pratiği — R skoru, sicile yazılmaz"><Film size={12} /> Senaryo</Link>
              </div>
            )}
            {activeTool === "indicators" && (
              <div className="ak-rail-panel ak-ind-panel">
                {CONCEPTS.map(([k, l]) => (
                  <label key={k}><input type="checkbox" checked={!!indById[k]?.enabled} onChange={() => toggleIndEnabled(k)} /> {l}</label>
                ))}
                <span className="ak-ma-title">HAREKETLİ ORTALAMA</span>
                {[20, 50, 200].map(p => (
                  <label key={p}>
                    <input type="checkbox" checked={!!indById["ma" + p]?.enabled} onChange={() => toggleIndEnabled("ma" + p)} />
                    <i className="ak-ma-dot" style={{ background: MA_COLORS[p] }} /> MA {p}
                  </label>
                ))}
                <label>
                  <input type="checkbox" checked={!!indById.maCustom?.enabled} onChange={() => toggleIndEnabled("maCustom")} />
                  <i className="ak-ma-dot" style={{ background: "var(--sage)" }} /> Özel
                  <input
                    type="number" className="ak-ma-custom" placeholder="periyot" min="2" max="500"
                    value={indById.maCustom?.params.period ?? ""} onClick={e => e.stopPropagation()}
                    onChange={e => setIndParam("maCustom", { period: parseInt(e.target.value, 10) || null })}
                  />
                </label>
                <label><input type="checkbox" checked={lanesOn} onChange={() => setLanesOn(v => !v)} /> Zaman şeridi katmanları</label>
                <span className="ak-ma-title">GÖSTERGE PANELİ</span>
                <label><input type="checkbox" checked={!!indById.rsi?.enabled} onChange={() => toggleIndEnabled("rsi")} /> RSI (14)</label>
              </div>
            )}
            {activeTool === "view" && (
              <div className="ak-rail-panel">
                <span className="ak-rail-panel-head">Grafik tipi</span>
                <div className="ak-tf">
                  {[["candle", "Mum"], ["line", "Çizgi"], ["area", "Alan"], ["heikinashi", "Heikin-Ashi"]].map(([k, l]) => (
                    <button key={k} className={chartType === k ? "on" : ""} onClick={() => setChartType(k)}>{l}</button>
                  ))}
                </div>
                <span className="ak-rail-panel-head">Karşılaştır</span>
                <input type="text" placeholder="Sembol (örn. ETH)" value={compareQuery} spellCheck={false}
                  onChange={(e) => setCompareQuery(e.target.value)} className="ak-cmp-in" />
                <div className="ak-rail-panel-row">
                  <button className="ak-view-basic" onClick={() => {
                    const s = compareQuery.trim().toUpperCase();
                    if (!s) return;
                    setCompareSymbol(s); setCompareOn(true);
                  }}>Ekle</button>
                  {compareSymbol && (
                    <button className="ak-view-basic" onClick={() => { setCompareOn(false); setCompareSymbol(null); setCompareQuery(""); }}>Kaldır</button>
                  )}
                </div>
                {compareOn && compareSymbol && <span className="ak-rail-hint">Karşılaştırılıyor: {compareSymbol}</span>}
                <span className="ak-rail-panel-head">Panel görünümü</span>
                {PANELS.map(pn => (
                  <label key={pn.k}><input type="checkbox" checked={!!lay[pn.k]} onChange={e => setPanel(pn.k, e.target.checked)} /> {pn.label}</label>
                ))}
                <button className="ak-view-basic" onClick={resetBasic}>Temel (varsayılana dön)</button>
                <span className="ak-rail-panel-head">Diğer</span>
                <button className="ak-view-basic" onClick={() => chartRef.current?.goToBookmark()} title="Alt+tık ile sarı yer imi koy, buraya bas ya da işarete çift tıkla dön">◆ İşarete dön</button>
              </div>
            )}
          </div>}

          <div className="ak-chart-main">
            {!fullscreen && (
              <div className="ak-cf-top">
                {pairFor(symbol) && (
                  <div className="ak-tf">
                    {TIMEFRAMES.map(([k, l]) => (
                      <button key={k} className={tf === k ? "on" : ""} onClick={() => setTf(k)}>{l}</button>
                    ))}
                  </div>
                )}
                <span className={"ak-datasrc" + (isReal(symbol) ? " real" : "")}>
                  {isReal(symbol) ? `● CANLI · Binance ${(TIMEFRAMES.find(x => x[0] === tfOf(symbol)) || ["", "4s"])[1]}` : "○ örnek veri"}
                </span>
              </div>
            )}
            {!fullscreen && stats24 && (
              <div className="ak-24h">
                <span>24s Y: <b>{fmtP(stats24.high)}</b></span>
                <span>D: <b>{fmtP(stats24.low)}</b></span>
                <span>Hacim: <b>{fmtVol(stats24.volSum)}</b></span>
              </div>
            )}
            {/* AK-092: tam ekranda TEK Chart aynı yerde kalır, yalnız sarmalayıcının class'ı
                (position:fixed overlay) değişir — Chart hiç unmount olmaz, iç state (çizim/zoom/pan) korunur. */}
            <div className={"ak-chart-viewport" + (fullscreen ? " ak-chart-fullscreen" : "")} ref={chartViewportRef}>
              {!fullscreen && (
                <button className="ak-chart-fs-btn" onClick={enterFullscreen} title="Tam ekran" aria-label="Tam ekran">
                  <Maximize2 size={16} />
                </button>
              )}
              {fullscreen && (
                <>
                  <button className="ak-chart-fs-exit" onClick={requestExitFullscreen} title="Çık (ESC)" aria-label="Tam ekrandan çık">
                    <X size={18} />
                  </button>
                  {/* AK-103: pinch-zoom'a ek, garanti çalışan buton fallback'i — tam ekranda tek
                      zoom yolu jest olmasın diye. */}
                  <div className="ak-chart-fs-zoom">
                    <button onClick={zoomOut} title="Uzaklaş (daha çok bar)" aria-label="Uzaklaş">−</button>
                    <button onClick={zoomIn} title="Yakınlaş (daha az bar)" aria-label="Yakınlaş">+</button>
                  </div>
                </>
              )}
              {!dataOk && (
                <div className="ak-nodata">
                  <b>{symbol}</b> için veri bekleniyor… Binance'te {symbol}USDT deneniyor; bulunamazsa burada açıkça söylenir — başka sembolün örnek verisi ASLA gösterilmez.
                </div>
              )}
              {dataOk && <Chart ref={chartRef} bars={replay ? getBars(symbol) : (liveBars || getBars(symbol))} concepts={hypothesis?.tested && matchIncludesSweep ? [...chartConcepts, "sweep"] : chartConcepts} maList={maList} trades={replay ? null : res?.trades} logScale={logS} magnet={magnetOn} range={chartRange} onRangeSelect={replay ? null : ((gs, ge) => { const N = getBars(symbol).length; if (gs == null) { setWin({ s: 0, e: 1 }); } else { setWin({ s: gs / (N - 1), e: ge / (N - 1) }); } })} chartType={chartType} symbol={symbol} drawMode={drawMode} compareBars={compareOn && compareSymbol && hasData(compareSymbol) ? getBars(compareSymbol) : null} onDrawsChange={setDrawCount} showRsi={showRsi} onSandboxAdd={handleSandboxAdd}
                indicators={legendIndicators} onIndicatorToggleShown={toggleIndShown} onIndicatorRemove={removeIndicator} onIndicatorSetParam={setIndParam}
                lastRemovedIndicator={lastRemovedInd} onUndoRemoveIndicator={undoRemoveIndicator} onPushUndo={(action) => undoStackRef.current.push(action)}
                onPositionDragEnd={handlePositionDragEnd} onInspectRange={handleInspectRange}
                onIndicatorsClear={disableAllIndicators} onOpenViewSettings={() => setActiveTool("view")} />}
              {paperMsg && <p className="ak-paper-toast">{paperMsg}</p>}
            </div>
          </div>
        </div>
        {!fullscreen && replay && (
          <div className="ak-replay">
            <button className="ak-rp" onClick={() => setCursor(c => Math.max(winStart + 4, c - 1))} title="Geri"><SkipBack size={15} /></button>
            <button className="ak-rp play" onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="ak-rp" onClick={() => setCursor(c => Math.min(Math.min(winEnd, _N - 1), c + 1))} title="İleri"><SkipForward size={15} /></button>
            <div className="ak-rp-prog"><div style={{ width: `${((cursor - winStart) / Math.max(1, winEnd - winStart)) * 100}%` }} /></div>
            <div className="ak-rp-speed">{[[1, 280], [2, 140], [4, 70]].map(([x, ms]) => <button key={x} className={speed === ms ? "on" : ""} onClick={() => setSpeed(ms)}>{x}x</button>)}</div>
            <button className="ak-rp txt" onClick={() => { setCursor(winStart + Math.min(30, Math.floor((winEnd - winStart) / 3))); setPlaying(false); }}><RotateCcw size={13} /> Sıfırla</button>
          </div>
        )}
        {!fullscreen && replay && (
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
        {!fullscreen && (
          <div className="ak-ranges">
            <button className={logS ? "on" : ""} title="Logaritmik fiyat ölçeği" onClick={() => setLogS(v => !v)}>Log</button>
            <button className={magnetOn ? "on" : ""} title="Mıknatıs — imleci en yakın O/Y/D/K'ya yasla" onClick={() => setMagnetOn(v => !v)}>Mıknatıs</button>
            <span className="ak-ranges-sep" />
            <button title="Uzaklaş (daha çok bar)" onClick={zoomOut}>−</button>
            <button title="Yakınlaş (daha az bar)" onClick={zoomIn}>+</button>
            <span className="ak-ranges-sep" />
            {[["14G", 84], ["1A", 180], ["3A", 540], ["Tümü", 900]].map(([lb, nb]) => (
              <button key={lb} onClick={() => { setWin({ s: Math.max(0, 1 - nb / 900), e: 1 }); }}>{lb}</button>
            ))}
            <span className="ak-ranges-sep" />
            <button title="Grafiği PNG olarak indir" onClick={downloadChartPNG}><Download size={12} /> PNG</button>
          </div>
        )}
        {!fullscreen && lay.timeline && <Timeline bars={getBars(symbol)} win={win} onChange={setWin}
          lanes={lanes} lanesOn={lanesOn}
          onToggleLane={(k) => setLanes(l => l.includes(k) ? l.filter(z => z !== k) : [...l, k])} />}
      </div>

      <div className="ak-lab-grid">
        <div className="ak-panel">
          <h2><FlaskConical size={17} /> Strateji</h2>

          {/* AK-073: Hazır Strateji (ATR×RR tabanlı FVG motoru) / Kendi Kodum (sandboxed kullanıcı kodu) — ikisi de aynı grafiğe ve Sonuç paneline bağlanır */}
          <div className="ak-kod-modes">
            <button className={"ak-kod-tab" + (stratMode === "hazir" ? " on" : "")} onClick={() => switchStratMode("hazir")}><FlaskConical size={13} /> Hazır Strateji</button>
            <button className={"ak-kod-tab" + (stratMode === "kendi" ? " on" : "")} onClick={() => switchStratMode("kendi")}><Code2 size={13} /> Kendi Kodum</button>
          </div>

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
              {open && (favSuggestions.length > 0 || otherSuggestions.length > 0 || (query.trim() && pairFor(query.trim()))) && (
                <div className="ak-sug">
                  {favSuggestions.length > 0 && (
                    <>
                      <span className="ak-sug-group">★ FAVORİLER</span>
                      {favSuggestions.map((s) => (
                        <button key={s.sym} onClick={() => pick(s)}>
                          <b>{s.sym}</b><span>{s.name}</span><em>{s.group}</em>
                        </button>
                      ))}
                    </>
                  )}
                  {otherSuggestions.length > 0 && (
                    <>
                      {favSuggestions.length > 0 && <span className="ak-sug-group">TÜMÜ</span>}
                      {otherSuggestions.map((s) => (
                        <button key={s.sym} onClick={() => pick(s)}>
                          <b>{s.sym}</b><span>{s.name}</span><em>{s.group}</em>
                        </button>
                      ))}
                    </>
                  )}
                  {favSuggestions.length === 0 && otherSuggestions.length === 0 && query.trim() && pairFor(query.trim()) && (
                    <button onClick={() => pick({ sym: query.trim().toUpperCase() })}>
                      <b>{query.trim().toUpperCase()}</b><span>listede yok — Binance'te dene</span><em>Kripto</em>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="ak-active-sym">Seçili: <b>{symbol}</b></div>

          {inspectRange && (
            <StrategyExtractor
              bars={getBars(symbol)}
              range={inspectRange}
              onGenerateCode={handleGeneratedCode}
              onClose={() => setInspectRange(null)}
            />
          )}

          {stratMode === "hazir" ? (
            <>
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
            </>
          ) : (
            <>
              <SistemimKoduPanel
                symbol={symbol}
                showSymbolPicker={false}
                showResultsList={false}
                onRunResult={handleCodeRunResult}
                onCodeChange={(c) => { codeRef.current = c; }}
                onParamsChange={handleParamsChange}
                externalCode={externalCode}
                externalCodeVersion={externalCodeVersion}
                flashVersion={flashVersion}
              />
              {paramsWarn && <span className="ak-kod-params-warn">PARAMS okunamadı — son geçerli hal korunuyor</span>}
              {codeInfo?.kind === "empty" && (
                <p className="ak-note">Kod çalıştı ama hiç işlem tetiklenmedi — kod hatasız çalıştı, sinyal üretmedi ya da tetiklenen sinyaller 40 bar içinde ne stop ne hedefe değmedi.</p>
              )}
              {hypothesis && (() => {
                const hs = hypothesisStatus(hypothesis);
                return (
                  <div className={"ak-hyp-badge " + hs.tone}>{hs.label}</div>
                );
              })()}
              {hypothesis && !hypothesis.tested && (
                <div className="ak-se-gate">
                  <p>Bu kural senin seçtiğin bölgeden çıktı; oraya uyması sürpriz değil. Gerçek sınav: tüm geçmişte test et.</p>
                  <button className="ak-btn ak-btn-primary" onClick={runOosTest} disabled={oosBusy}>
                    <ShieldCheck size={15} /> {oosBusy ? "Test ediliyor…" : "Tüm geçmişte test et"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* AK-082 C1: tetik artık dikey side toolbar'ın "Strateji araçları" panelinde — hesaplayıcının kendisi burada aynı yerde kalır */}
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
          <h2><Activity size={17} /> Sonuç {res && <span className="ak-res-ctx">{symbol} · {stratMode === "kendi" ? "Kendi Kodum" : `1:${rr}`}</span>}</h2>
          {!res && stratMode === "hazir" && <p className="ak-hint">Sembolü ara, parametreni ayarla, “Backtest çalıştır”a bas. İpucu: <b>SOL</b> ile <b>RND</b>’yi karşılaştır.</p>}
          {!res && stratMode === "kendi" && !codeInfo && <p className="ak-hint">"Kendi Kodum" sekmesinde kodunu yaz, “Çalıştır”a bas — sonuçlar burada ve grafikte görünür.</p>}
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
              {hypothesis?.tested && (
                <div className="ak-mg">
                  <div className="ak-mg-sum">
                    <div className="ak-mg-sum-row">
                      <span>Eşleşme Gezgini</span>
                      <div className="ak-tf">
                        {[["3ay", "3ay"], ["1yil", "1yıl"], ["tumu", "Tümü"]].map(([k, l]) => (
                          <button key={k} className={matchPeriod === k ? "on" : ""} onClick={() => { setMatchPeriod(k); setMatchIdx(0); }}>{l}</button>
                        ))}
                      </div>
                    </div>
                    {periodTrades.length === 0 ? (
                      <p className="ak-se-nohit">Bu dönemde kuralına uyan bölge bulunamadı.</p>
                    ) : (
                      <p>
                        Bu dönemde kuralına uyan <b>{periodTrades.length}</b> bölge —{" "}
                        <b>{periodTrades.filter(t => t.outcome > 0).length}</b> kazanç,{" "}
                        <b>{periodTrades.filter(t => t.outcome <= 0).length}</b> kayıp
                      </p>
                    )}
                  </div>
                  {periodTrades.length > 0 && (
                    <>
                      <div className="ak-mg-nav">
                        <button onClick={() => goToMatch(matchIdx - 1)}><ChevronLeft size={14} /></button>
                        <span>◀ {matchIdx + 1}/{periodTrades.length} ▶</span>
                        <button onClick={() => goToMatch(matchIdx + 1)}><ChevronRight size={14} /></button>
                      </div>
                      <div className="ak-mg-list">
                        {periodTrades.map((t, i) => (
                          <button key={i} className={"ak-mg-row" + (i === matchIdx ? " on" : "")} onClick={() => goToMatch(i)}>
                            <span className="dt">#{t.entryIdx} · {t.dir === 1 ? "LONG" : "SHORT"}</span>
                            <span className={"rr " + (t.outcome > 0 ? "pos" : "neg")}>{t.outcome > 0 ? "+" : ""}{Math.round(t.outcome * 100) / 100}R</span>
                            <span>{t.outcome > 0 ? "W" : "L"}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
