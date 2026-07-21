import { useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Lock, Unlock, Copy, Trash2 } from "lucide-react";
import { findFVG, findOrderBlocks, findBOS, ema, rsi, findMitigation, orderFlowArr, findFib, findSweep } from "../lib/detectors.js";
import { inPlotArea } from "../lib/chartGeometry.js";
import { rafThrottle } from "../lib/rafThrottle.js";
import ChartLegend from "./ChartLegend.jsx";

// AK-069: çizimlere kalıcı id — sicil/sandbox'takiyle aynı desen (crypto.randomUUID, yoksa yedek)
function uid() {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
}
const DRAW_COLORS = ["var(--gold)", "var(--teal)", "var(--good)", "var(--bad)"];
const DRAW_WIDTHS = [1, 1.6, 2.4];

// Heikin-Ashi dönüşümü: her mum bir önceki HA gövdesine bağlı, o yüzden tüm dizi baştan hesaplanır.
function heikinAshi(bars) {
  const out = new Array(bars.length);
  let prevO, prevC;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const c = (b.o + b.h + b.l + b.c) / 4;
    const o = i === 0 ? (b.o + b.c) / 2 : (prevO + prevC) / 2;
    const h = Math.max(b.h, o, c);
    const l = Math.min(b.l, o, c);
    out[i] = { ...b, o, h, l, c };
    prevO = o; prevC = c;
  }
  return out;
}

// AK-050: modül seviyesinde sabit referanslar — showEma yoluyla her render'da yeni dizi
// oluşup useMemo'yu boşuna tetiklemesin diye.
const LEGACY_MA_LIST = [{ period: 20, color: null }];
const EMPTY_MA_LIST = [];

// Canlı mum grafiği + kavram katmanları. Tümü client-side (SVG).
// props: bars, concepts(array), showEma(bool), maList([{period,color}]), maxView(son N bar)
// AK-050: maList verilirse çoklu MA (her biri kendi periyot+rengiyle) çizilir; verilmezse
// showEma(bool) eski tek-EMA20 davranışını birebir korur (geriye uyumluluk).
const Chart = forwardRef(function Chart({ bars, concepts = ["fvg"], showEma = true, maList = null, maxView = 120, trades = null, range = null, onRangeSelect = null, logScale = false, magnet = true, chartType = "candle", symbol = "", drawMode = null, compareBars = null, onDrawsChange = null, showRsi = false, onSandboxAdd = null, indicators = [], onIndicatorToggleShown = null, onIndicatorRemove = null, onIndicatorSetParam = null, lastRemovedIndicator = null, onUndoRemoveIndicator = null, onPushUndo = null, onPositionDragEnd = null, onInspectRange = null, onIndicatorsClear = null, onOpenViewSettings = null }, ref) {
  // AK-097: sabit 1000×480 yerine konteynerin gerçek px boyutu — bkz. svgRef'in ResizeObserver
  // effect'i. null = henüz ölçülmedi (ilk render).
  const [size, setSize] = useState(null);
  const hasR = range && range.start != null;
  const FUT = 120; // sağda gelecek boşluğu (fib/projeksiyon) — pencere son barı bu kadar aşabilir
  const rawEnd = hasR ? range.end : bars.length - 1;
  const futureSlots = Math.min(FUT, Math.max(0, rawEnd - (bars.length - 1)));
  const view = useMemo(() => hasR ? bars.slice(range.start, Math.min(rawEnd, bars.length - 1) + 1) : bars.slice(-maxView), [bars, maxView, hasR, range, rawEnd]);
  const off = hasR ? range.start : bars.length - view.length; // global -> view kaydırma
  // güvenlik: 2 bardan az görünüm çizilemez (bölme sıfıra düşer)
  const endIdx = off + view.length - 1;
  // AK-050: maList yoksa eski tek-EMA20 listesine düşer (görünüm birebir aynı kalsın diye
  // renk atanmaz — .ak-c-ema sınıfının varsayılan turkuaz rengi kullanılır). Lab.jsx maList'i
  // kendi useMemo'sunda üretir, referansı sabit kalır, gereksiz yeniden hesap olmaz.
  // maList != null: çağıran yeni özelliği kullanıyor demektir — boş dizi de dahil (kullanıcı hepsini kapatmış olabilir).
  const activeMaList = maList != null ? maList : (showEma ? LEGACY_MA_LIST : EMPTY_MA_LIST);
  // AK-T2: pahalı MA hesabı tam seri üzerinde (yalnız bars+activeMaList'e bağlı),
  // pencereye kırpma ayrı satırda (off/view.length değişirse sadece slice çalışır).
  const maArrsAll = useMemo(
    () => activeMaList.map((m) => ({ ...m, arr: ema(bars, m.period) })),
    [bars, activeMaList]
  );
  const maArrs = useMemo(
    () => maArrsAll.map((m) => ({ ...m, arr: m.arr.slice(off, off + view.length) })),
    [maArrsAll, off, view.length]
  );
  const inWin = i => i >= off && i <= endIdx;
  // AK-T2: dedektör hesapları iki aşamaya bölündü — pahalı hesap (bars+concepts bağımlı)
  // ile ucuz filtre (off+endIdx bağımlı) ayrı useMemo'da. Pan/zoom yalnız filtreyi yeniden koşar.
  const fvgsAll = useMemo(() => concepts.includes("fvg") ? findFVG(bars) : [], [bars, concepts]);
  const fvgs = useMemo(() => fvgsAll.filter(g => g.i >= off && g.i <= endIdx), [fvgsAll, off, endIdx]);
  const obsAll = useMemo(() => concepts.includes("ob") ? findOrderBlocks(bars) : [], [bars, concepts]);
  const obs = useMemo(() => obsAll.filter(o => o.i >= off && o.i <= endIdx), [obsAll, off, endIdx]);
  const bosAll = useMemo(() => concepts.includes("bos") ? findBOS(bars) : [], [bars, concepts]);
  const bos = useMemo(() => bosAll.filter(b => b.i >= off && b.i <= endIdx), [bosAll, off, endIdx]);
  const mitsAll = useMemo(() => concepts.includes("mit") ? findMitigation(bars) : [], [bars, concepts]);
  const mits = useMemo(() => mitsAll.filter(m => m.i >= off && m.i <= endIdx), [mitsAll, off, endIdx]);
  // AK-087/C6: Eşleşme Gezgini'nde "sweep" bloklu bir kural gezilirken süpürme oku çizilebilsin diye.
  const sweepsAll = useMemo(() => concepts.includes("sweep") ? findSweep(bars) : [], [bars, concepts]);
  const sweeps = useMemo(() => sweepsAll.filter(s => s.i >= off && s.i <= endIdx), [sweepsAll, off, endIdx]);
  const ofArr = useMemo(() => concepts.includes("of") ? orderFlowArr(bars) : null, [bars, concepts]);
  const fib = useMemo(() => concepts.includes("fib") ? findFib(view, view.length) : null, [view, concepts]);
  // AK-044: Heikin-Ashi tüm seriden hesaplanır (önceki HA gövdesine bağımlı), sonra pencereye kırpılır
  const haFull = useMemo(() => chartType === "heikinashi" ? heikinAshi(bars) : null, [bars, chartType]);
  const plotBars = haFull ? haFull.slice(off, off + view.length) : view;
  // AK-055: ayrı RSI paneli — mum/hacim panelini büyütmez, altına ek alan olarak eklenir
  const rsiArr = useMemo(() => showRsi ? rsi(bars, 14) : null, [bars, showRsi]);
  const rsiView = rsiArr ? rsiArr.slice(off, off + view.length) : null;

  // AK-097: sabit W=1000/H=480 yerine konteynerin GERÇEK px boyutu (ResizeObserver ile ölçülür,
  // bkz. svgRef'in bağlandığı yerdeki effect). size=null iken (ilk render, ölçüm henüz gelmedi)
  // W/svgH/H sıfıra düşer — bu durumda aşağıdaki `ready` bayrağı JSX'in gövdesini hiç ÇİZMEZ,
  // sadece boş <svg ref=...> döner (ResizeObserver'ın gözlemleyeceği eleman mevcut olsun diye).
  // x()/y()/step gibi tüm türetilmiş hesaplar DEĞİŞMEDİ — yalnız W/H'nin kaynağı reaktif oldu.
  const pL = 6, pT = 12, pB = 26;
  const RSI_H = 80, RSI_PAD_T = 10, RSI_PAD_B = 14;
  const W = size ? size.w : 0;
  const svgH = size ? size.h : 0;
  const H = Math.max(0, svgH - (showRsi ? RSI_H : 0));
  const rsiTop = H + RSI_PAD_T, rsiBottom = H + RSI_H - RSI_PAD_B;
  const yRsi = (v) => rsiBottom - (v / 100) * (rsiBottom - rsiTop);
  const lo = Math.min(...view.map(b => b.l)), hi = Math.max(...view.map(b => b.h)), rg = hi - lo || 1;
  // Fiyat büyüklüğüne göre ondalık (AK-027): 104,230 · 1,043 · 84.2 · 1.04 · 0.0432
  const fmtP = (p) => {
    if (!Number.isFinite(p)) return "";
    const a = Math.abs(p);
    if (a >= 10000) return Math.round(p).toLocaleString("en-US");
    if (a >= 1000) return p.toFixed(0);
    if (a >= 100) return p.toFixed(1);
    if (a >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };
  const pR = Math.max(52, fmtP(hi).length * 7.2 + 10); // etiket sığacak kadar eksen
  const slots = view.length + futureSlots;
  const x = i => pL + (i / Math.max(1, slots - 1)) * (W - pL - pR);
  // Dikey ölçek (AK-030): eksen sürüklenince vScale değişir (1 = otomatik sığdır). Log ölçek destekli.
  const [vView, setVView] = useState(null); // null = oto-sığdır; {mid, half} = kullanıcı dikey görünümü
  // AK-095/Bug2: yatay pan sırasında oto-sığdır (vView=null) her karede o anki view'dan lo/hi'yi
  // YENİDEN hesaplıyordu — off/endIdx her sürükleme adımında değiştiği için dikey ölçek de
  // "zıplıyordu" (kullanıcı sadece yatay kaydırırken bile). Pan başlarken mevcut lo/hi'den bir
  // görünüm dondurulur (vFreezeRef), sürükleme bitene kadar SABİT kalır; bitince (vView hâlâ
  // null'sa) oto-sığdır otomatik devreye girer (freeze temizlenir, aşağıdaki hesap yeniden lo/hi'ye döner).
  const vFreezeRef = useRef(null);
  useEffect(() => { setVView(null); vFreezeRef.current = null; }, [bars]); // sembol/veri değişince sıfırla
  const mid = vView ? vView.mid : vFreezeRef.current ? vFreezeRef.current.mid : (lo + hi) / 2;
  const half = vView ? vView.half : vFreezeRef.current ? vFreezeRef.current.half : rg / 2;
  const elo = Math.max(logScale ? 1e-9 : -Infinity, mid - half), ehi = mid + half, erg = ehi - elo || 1;
  const lnLo = Math.log(Math.max(1e-9, elo)), lnHi = Math.log(Math.max(elo * 1.0001, ehi));
  const y = p => logScale
    ? pT + (1 - (Math.log(Math.max(1e-9, p)) - lnLo) / (lnHi - lnLo)) * (H - pT - pB)
    : pT + (1 - (p - elo) / erg) * (H - pT - pB);
  const priceAt = py => logScale
    ? Math.exp(lnHi - ((py - pT) / (H - pT - pB)) * (lnHi - lnLo))
    : ehi - ((py - pT) / (H - pT - pB)) * erg;
  const step = (W - pL - pR) / view.length, bw = Math.max(1.6, step * 0.62);
  const gi = i => i - off; // global index -> view x index

  // AK-058: kağıt-işlem kutusu — grafik sandbox.js'e dokunmaz, yalnız onSandboxAdd(sym,dir,plan) tetikler
  const [paperPlan, setPaperPlan] = useState(2);
  function paperTrade(dir) {
    const plan = Number(paperPlan);
    if (!Number.isFinite(plan) || plan <= 0) return;
    onSandboxAdd?.(symbol, dir, plan);
  }

  // Crosshair (AK-026): imleç -> bar/fiyat eşlemesi
  const [hov, setHov] = useState(null); // {i(view), px, py, price}
  useEffect(() => { setHov(null); }, [off, view.length]); // zoom/pan sonrası bayat indeks kalmasın
  // AK-085-TAMAMLAMA/C4: fare mousemove native olay hızında ateşlenir (bazı sistemlerde 60fps'in
  // çok üstünde) — her olayda setHov çağırmak gereksiz re-render'a yol açar. rafThrottle (paylaşılan
  // yardımcı, src/lib/rafThrottle.js) bir karede birden fazla olay gelirse yalnız SONUNCUSUNU işler.
  // Render'da her seferinde yeniden oluşturulur (view/magnet/x/y güncel kalsın), bu güvenlidir:
  // yeni bir re-render zaten yalnız fn() (setHov) tetiklendiğinde olur — o an "pending" hep boşalmış olur.
  const onMoveThrottled = rafThrottle((clientX, clientY, r) => {
    const px = ((clientX - r.left) / r.width) * W;
    const py = ((clientY - r.top) / r.height) * H;
    if (!inPlotArea(px, py, { pL, pR, pT, pB, W, H })) { setHov(null); return; }
    const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
    let price = priceAt(py), snapPy = py;
    if (magnet) {
      const b = view[Math.min(i, view.length - 1)];
      if (b) {
        const cands = [b.o, b.h, b.l, b.c];
        price = cands.reduce((best, v) => Math.abs(v - price) < Math.abs(best - price) ? v : best, cands[0]);
        snapPy = y(price);
      }
    }
    setHov({ i, px: x(i), py: snapPy, price });
    if (dragRef.current?.mode === "sel") setSel(sl => (sl ? { ...sl, b: i, yb: py } : sl)); // taze i+py — kutu fareyi iki eksende izler
  });
  const onMoveThrottledRef = useRef(null);
  onMoveThrottledRef.current = onMoveThrottled;
  useEffect(() => () => onMoveThrottledRef.current?.cancel(), []);
  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    onMoveThrottled(e.clientX, e.clientY, r);
  }
  // AK-085-TAMAMLAMA/C4: pan/zoom sırasında onRangeSelect Lab.jsx'te state güncelleyip Chart'a
  // yeni props olarak geri döner (tam bir parent+child re-render turu) — wheel/touchmove ham olay
  // hızında (bazı fare/trackpad'lerde 60fps'in üstünde) her seferinde çağırmak yerine AYNI
  // rafThrottle ile bir karede en fazla bir kez tetiklenir. Hesabın kendisi (span/anchor/sınır
  // mantığı, çağrı yerlerinde) değişmedi, yalnız kaç kez tetiklendiği.
  const throttledRangeSelect = rafThrottle((gs, ge) => onRangeSelect && onRangeSelect(gs, ge));
  const throttledRangeSelectRef = useRef(null);
  throttledRangeSelectRef.current = throttledRangeSelect;
  useEffect(() => () => throttledRangeSelectRef.current?.cancel(), []);
  // AK-028b: imleç odaklı tekerlek zoom (native listener; passive:false şart)
  const svgRef = useRef(null);
  // AK-097: svg'nin GERÇEK CSS kutu boyutu (width/height CSS'ten gelir — bkz. chart.css .ak-chart)
  // ResizeObserver ile ölçülüp size state'ine yazılır; ardı ardına gelen resize olayları rafThrottle
  // ile bir karede en fazla bir kez state güncellemesine dönüşür (pan/zoom'daki AYNI desen).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const applySize = rafThrottle((w, h) => {
      setSize((prev) => (prev && prev.w === w && prev.h === h) ? prev : { w, h });
    });
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      applySize(Math.round(cr.width), Math.round(cr.height));
    });
    ro.observe(el);
    return () => { ro.disconnect(); applySize.cancel(); };
  }, []);
  const zoomRef = useRef(null);
  zoomRef.current = { off, len: slots, total: bars.length, hov };
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onRangeSelect) return;
    const onWheel = (e) => {
      e.preventDefault();
      const { off, len, total, hov } = zoomRef.current;
      const anchorFrac = hov ? hov.i / Math.max(1, len - 1) : 0.5;
      const anchorG = off + Math.round(anchorFrac * (len - 1));
      const span = Math.round(Math.min(total, Math.max(20, len * (e.deltaY > 0 ? 1.25 : 0.8))));
      const maxEnd = total - 1 + 120; // geleceğe taşma payı (Chart.FUT ile aynı)
      let gs = Math.round(anchorG - anchorFrac * span);
      gs = Math.max(0, Math.min(maxEnd - span + 1, gs));
      throttledRangeSelect(gs, gs + span - 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onRangeSelect]);

  // AK-044: dokunmatik pan (tek parmak) + pinch-zoom (iki parmak)
  const touchRef = useRef(null);
  const touchDist = (t0, t1) => Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  // AK-085-TAMAMLAMA/C2: mobil "uzun-bas" — masaüstü sağ-tıkla AYNI boş-alan menüsünü açar.
  // Parmak LONG_PRESS_MS boyunca LONG_PRESS_TOL px'ten fazla hareket etmezse tetiklenir;
  // hareket ederse (pan/pinch niyeti) ya da parmak kalkarsa iptal edilir.
  const LONG_PRESS_MS = 500, LONG_PRESS_TOL = 10;
  const longPressRef = useRef(null); // {timer, x0, y0}
  function clearLongPress() {
    if (longPressRef.current?.timer) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }
  function onTouchStart(e) {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.touches.length === 2) {
      clearLongPress();
      touchRef.current = { mode: "pinch", d0: touchDist(e.touches[0], e.touches[1]), off0: off, len0: view.length, total: bars.length };
      setHov(null);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (!vView) vFreezeRef.current = { mid, half }; // AK-095/Bug2: dokunmatik pan başlarken dikey görünümü dondur
      touchRef.current = { mode: "pan", x0: t.clientX, off0: off, len0: view.length, total: bars.length, pxPerBar: r.width * ((W - pL - pR) / W) / view.length };
      const px = ((t.clientX - r.left) / r.width) * W, py = ((t.clientY - r.top) / r.height) * H;
      const inPlot = inPlotArea(px, py, { pL, pR, pT, pB, W, H });
      const i0 = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      if (inPlot) {
        let price = priceAt(py), snapPy = py;
        if (magnet) {
          const b = view[Math.min(i0, view.length - 1)];
          if (b) { const cands = [b.o, b.h, b.l, b.c]; price = cands.reduce((best, v) => Math.abs(v - price) < Math.abs(best - price) ? v : best, cands[0]); snapPy = y(price); }
        }
        setHov({ i: i0, px: x(i0), py: snapPy, price });
      }
      clearLongPress();
      longPressRef.current = {
        x0: t.clientX, y0: t.clientY,
        timer: setTimeout(() => {
          longPressRef.current = null;
          touchRef.current = null; // uzun-bas menüye dönüştü — pan olarak devam etmesin
          if (!inPlot) return;
          setCtxMenu(null);
          setEmptyCtxMenu({ leftPct: ((t.clientX - r.left) / r.width) * 100, topPct: ((t.clientY - r.top) / r.height) * 100, i: off + i0, price: priceAt(py) });
        }, LONG_PRESS_MS),
      };
    }
  }
  function onTouchEnd(e) {
    clearLongPress();
    if (e.touches.length === 0) {
      if (touchRef.current?.mode === "pan") vFreezeRef.current = null; // AK-095/Bug2: bırakınca oto-sığdıra dön
      touchRef.current = null; setHov(null);
    }
  }
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onTouchMoveNative = (e) => {
      const lp = longPressRef.current;
      if (lp && e.touches.length === 1) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - lp.x0, t.clientY - lp.y0) > LONG_PRESS_TOL) clearLongPress();
      }
      const d = touchRef.current;
      if (!d || !onRangeSelect) return;
      e.preventDefault();
      if (d.mode === "pinch" && e.touches.length === 2) {
        const d1 = touchDist(e.touches[0], e.touches[1]);
        const ratio = d.d0 / Math.max(1, d1); // parmaklar açılınca (d1>d0) ratio<1 → yakınlaş (az bar)
        const span = Math.round(Math.min(d.total, Math.max(20, d.len0 * ratio)));
        const maxEnd = d.total - 1 + 120;
        const mid = d.off0 + d.len0 / 2;
        let gs = Math.round(mid - span / 2);
        gs = Math.max(0, Math.min(maxEnd - span + 1, gs));
        throttledRangeSelect(gs, gs + span - 1);
      } else if (d.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        const db = Math.round((d.x0 - t.clientX) / Math.max(0.5, d.pxPerBar));
        const maxEnd = d.total - 1 + 120;
        let gs = Math.max(0, Math.min(maxEnd - d.len0 + 1, d.off0 + db));
        throttledRangeSelect(gs, gs + d.len0 - 1);
      }
    };
    el.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMoveNative);
  }, [onRangeSelect]);

  // AK-047: boşluk basılıyken "el aracı" — hem yatay hem dikey serbest sürükleme
  const [spaceDown, setSpaceDown] = useState(false);
  const [handDragging, setHandDragging] = useState(false);
  const overRef = useRef(false);
  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKeyDown(e) {
      if (e.code === "Space" && overRef.current && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    }
    function onKeyUp(e) { if (e.code === "Space") setSpaceDown(false); }
    function onBlur() { setSpaceDown(false); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // AK-047: sarı yer imi (bookmark) — sembol bazlı localStorage, alt+tık ile konur, sürüklenebilir
  const [bookmark, setBookmark] = useState(null); // {barIndex(global), price}
  useEffect(() => {
    try { setBookmark(JSON.parse(localStorage.getItem(`ak_bookmark_${symbol}`))); } catch { setBookmark(null); }
  }, [symbol]);
  useEffect(() => {
    try {
      if (bookmark) localStorage.setItem(`ak_bookmark_${symbol}`, JSON.stringify(bookmark));
      else localStorage.removeItem(`ak_bookmark_${symbol}`);
    } catch { /* kotayı aşarsa sessiz geç */ }
  }, [bookmark, symbol]);
  function goToBookmark() {
    if (!bookmark) {
      // AK-052: bookmark yoksa mevcut görünümün merkezinde otomatik biri oluşturulur — kullanıcı hiç "yok" durumuyla karşılaşmaz.
      setBookmark({ barIndex: off + Math.floor(view.length / 2), price: mid });
      return;
    }
    setVView({ mid: bookmark.price, half });
    if (onRangeSelect) {
      const width = view.length;
      const maxEnd = bars.length - 1 + 120;
      let gs = Math.round(bookmark.barIndex - width / 2);
      gs = Math.max(0, Math.min(maxEnd - width + 1, gs));
      onRangeSelect(gs, gs + width - 1);
    }
  }
  useImperativeHandle(ref, () => ({
    goToBookmark,
    clearDraws: () => clearAllDraws(),
    // AK-084/S1: kod→grafik senkronu — seçili pozisyon kutusu varsa onu, yoksa en son eklenen
    // pozisyon kutusunu günceller. Hiç pozisyon kutusu yoksa sessizce hiçbir şey yapmaz.
    // YALNIZ tpR taşınır: giriş/SL sabit kalır, TP = giriş + yön×risk×tpR yeniden hesaplanır.
    // (PARAMS.slR codegen.js'te ATR çarpanıdır — paramsBlock.ratiosFromLevels'ın hep 1 dönen
    // slR'ıyla AYNI ANLAMA gelmez; slR'ı buraya geri yazmak stop genişliğini sessizce bozardı.)
    applyParamsToPositionTpR: (tpR) => {
      if (!Number.isFinite(tpR) || tpR <= 0) return;
      setDraws(ds => {
        const positions = ds.filter(d => d.type === "position");
        if (!positions.length) return ds;
        const target = positions.find(d => d.id === selectedDrawId) || positions[positions.length - 1];
        const risk = Math.abs(target.entry - target.sl);
        if (!(risk > 0)) return ds;
        const dir = target.tp >= target.entry ? 1 : -1;
        const tp = target.entry + dir * risk * tpR;
        return ds.map(d => d.id === target.id ? { ...d, tp } : d);
      });
    },
  }));

  // AK-030: sürükleme modları — varsayılan PAN (TV standardı), Shift+sürükle = alan seç,
  // sağ eksen üzerinde sürükle = dikey ölçek (fiyatı aç/kapa). Çift tık: grafikte tümü, eksende oto-sığdır.
  const [sel, setSel] = useState(null); // {a,b} view index (Shift seçimi)
  const dragRef = useRef(null);
  function onDown(e) {
    if (e.button === 2) return; // AK-052/069: sağ-tık = context menu; sol-tık akışlarına (pan/çizim) karışmasın
    e.preventDefault(); // Shift+sürüklede tarayıcının metin seçimine girmesini engelle
    if (selectedDrawId != null) setSelectedDrawId(null); // boş alana tıklanınca seçili çizim bırakılır (bir çizime tıklanmışsa click olayı hemen ardından yeniden seçer)
    if (ctxMenu) setCtxMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    if (px > W - pR) { dragRef.current = { mode: "axis", y0: e.clientY, m0: mid, h0: half }; return; }
    if (e.altKey) {
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      setBookmark({ barIndex: off + i, price: priceAt(py) });
      return;
    }
    if (spaceDown) {
      setHandDragging(true);
      dragRef.current = { mode: "hand", x0: e.clientX, y0: e.clientY, off0: off, len0: view.length, m0: mid, h0: half, pxPerBar: r.width * ((W - pL - pR) / W) / view.length };
      return;
    }
    if (drawMode) {
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      const price = priceAt(py);
      // AK-071: yatay çizgi/ışın — sürüklemeye gerek yok, tek tıkla anında eklenir
      if (drawMode === "hline") { setDraws(ds => [...ds, { id: uid(), locked: false, type: "hline", price }]); return; }
      if (drawMode === "hray") { setDraws(ds => [...ds, { id: uid(), locked: false, type: "hray", a: { i: off + i, price } }]); return; }
      // AK-070: pozisyon aracı — tek tıkla varsayılan giriş/TP/SL ile eklenir, hemen seçili olur
      // (R:R etiketi + Sandbox butonu görünsün diye); üç çizgi de sonradan ayrı ayrı sürüklenebilir.
      if (drawMode === "position") {
        const span = rg * 0.1;
        const newId = uid();
        setDraws(ds => [...ds, { id: newId, locked: false, type: "position", i: off + i, entry: price, tp: price + span * 2, sl: price - span }]);
        setSelectedDrawId(newId);
        return;
      }
      const a = { i: off + i, price };
      const ghost = { type: drawMode, a, b: a };
      dragRef.current = { mode: "draw", ghost };
      setDrawGhost(ghost);
      return;
    }
    if (e.shiftKey) {
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      setSel({ a: i, b: i, ya: py, yb: py });
      dragRef.current = { mode: "sel" };
      return;
    }
    if (!vView) vFreezeRef.current = { mid, half }; // AK-095/Bug2: pan başlarken dikey görünümü dondur
    dragRef.current = { mode: "pan", x0: e.clientX, off0: off, len0: view.length, pxPerBar: r.width * ((W - pL - pR) / W) / view.length };
  }
  function onDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "draw") {
      const r = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      d.ghost = { ...d.ghost, b: { i: off + i, price: priceAt(py) } };
      setDrawGhost(d.ghost);
    } else if (d.mode === "axis") {
      const dy = e.clientY - d.y0;
      const h = Math.min(rg * 6, Math.max(rg * 0.02, d.h0 * Math.exp(dy * 0.004)));
      setVView({ mid: d.m0, half: h });
    } else if (d.mode === "hand") {
      if (onRangeSelect) {
        const db = Math.round((d.x0 - e.clientX) / Math.max(0.5, d.pxPerBar));
        const maxEnd = bars.length - 1 + 120;
        let gs = Math.max(0, Math.min(maxEnd - d.len0 + 1, d.off0 + db));
        throttledRangeSelect(gs, gs + d.len0 - 1);
      }
      const dy = e.clientY - d.y0;
      const pricePerPixel = (d.h0 * 2) / (H - pT - pB);
      setVView({ mid: d.m0 + dy * pricePerPixel, half: d.h0 });
    } else if (d.mode === "bookmark") {
      const r = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      setBookmark({ barIndex: off + i, price: priceAt(py) });
    } else if (d.mode === "posdrag") {
      // AK-070: pozisyon giriş/TP/SL çizgilerinden biri sürükleniyor — canlı fiyat güncellenir (R:R otomatik yeniden hesaplanır)
      const r = e.currentTarget.getBoundingClientRect();
      const py = ((e.clientY - r.top) / r.height) * H;
      const price = priceAt(py);
      setDraws(ds => ds.map((dr) => dr.id === d.id ? { ...dr, [d.handle]: price } : dr));
    } else if (d.mode === "drawHandle") {
      // AK-069: trend çizgisi/dikdörtgen/hline/hray uç nokta tutamacı sürükleniyor
      const r = e.currentTarget.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;
      const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
      const price = priceAt(py);
      setDraws(ds => ds.map((dr) => {
        if (dr.id !== d.id) return dr;
        if (d.which === "price") return { ...dr, price };
        if (d.which === "a") return { ...dr, a: { i: off + i, price } };
        if (d.which === "b") return { ...dr, b: { i: off + i, price } };
        return dr;
      }));
    } else if (d.mode === "pan" && onRangeSelect) {
      const db = Math.round((d.x0 - e.clientX) / Math.max(0.5, d.pxPerBar));
      const maxEnd = bars.length - 1 + 120;
      let gs = Math.max(0, Math.min(maxEnd - d.len0 + 1, d.off0 + db));
      throttledRangeSelect(gs, gs + d.len0 - 1);
    }
  }
  function onUpSel() {
    const d = dragRef.current;
    dragRef.current = null;
    setHandDragging(false);
    if (d?.mode === "pan") vFreezeRef.current = null; // AK-095/Bug2: bırakınca oto-sığdıra dön
    if (d?.mode === "draw") {
      const g = d.ghost;
      // AK-087/C1: "İncele" seçimi kalıcı bir çizim DEĞİL — bar aralığına çevrilip dışarı
      // verilir (oluşum paneli açılsın diye), draws listesine hiç eklenmez.
      if (g && g.type === "inspect") {
        if (g.a.i !== g.b.i) onInspectRange && onInspectRange(Math.min(g.a.i, g.b.i), Math.max(g.a.i, g.b.i));
        setDrawGhost(null);
        return;
      }
      if (g && (g.a.i !== g.b.i || g.a.price !== g.b.price)) setDraws(ds => [...ds, { ...g, id: uid(), locked: false }]);
      setDrawGhost(null);
      return;
    }
    if (d?.mode === "posdrag") {
      // AK-084/S2: sürükleme BİTİNCE (mousemove'da değil) parent'a haber verilir — R:R hesabı
      // ve PARAMS senkronu yalnız burada tetiklenir.
      const dr = draws.find(x => x.id === d.id);
      if (dr) onPositionDragEnd && onPositionDragEnd(dr);
    }
    if (d?.mode === "sel" && sel && onRangeSelect && Math.abs(sel.b - sel.a) >= 3) {
      if (Math.abs(sel.yb - sel.ya) >= 14) { // dikeyde de kutu çizildiyse fiyat bandına dal
        const p0 = priceAt(sel.ya), p1 = priceAt(sel.yb);
        setVView({ mid: (p0 + p1) / 2, half: Math.max(rg * 0.005, Math.abs(p0 - p1) / 2) });
      }
      const gs = off + Math.min(sel.a, sel.b), ge = off + Math.max(sel.a, sel.b);
      onRangeSelect(gs, ge);
    }
    setSel(null);
  }
  function onDbl(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px > W - pR) { setVView(null); return; } // eksene çift tık = oto-sığdır
    setVView(null);
    onRangeSelect && onRangeSelect(null);
  }
  // AK-085-TAMAMLAMA/C2: BOŞ ALAN bağlam menüsü (masaüstü sağ-tık). Bir çizimin üstündeyse bu
  // handler'a hiç ulaşılmaz (openCtxMenu zaten stopPropagation çağırıyor) — iki menü karışmaz.
  // Eksen/RSI panelinde (fiyat eşlemesi anlamsız) menü açılmaz.
  function onCanvasContextMenu(e) {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    if (!inPlotArea(px, py, { pL, pR, pT, pB, W, H })) return;
    const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
    setCtxMenu(null);
    setEmptyCtxMenu({ leftPct: ((e.clientX - r.left) / r.width) * 100, topPct: ((e.clientY - r.top) / r.height) * 100, i: off + i, price: priceAt(py) });
  }

  const lastB = view[view.length - 1];
  const dtMs = view.length > 1 && lastB?.time ? (lastB.time - view[view.length - 2].time) : 0;
  const labelAt = (vi) => {
    const b = view[vi];
    if (b?.time) return new Date(b.time).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    if (b) return "#" + (off + vi);
    if (dtMs && lastB?.time) return new Date(lastB.time + dtMs * (vi - (view.length - 1))).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    return "+" + (vi - (view.length - 1));
  };
  const fmtT = (b, gi_) => b?.time
    ? new Date(b.time).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
    : "#" + gi_;
  const hasVol = view.some(b => b.v > 0);
  const maxV = hasVol ? Math.max(...view.map(b => b.v || 0)) : 1;

  const hovI = hov ? Math.min(hov.i, view.length - 1) : view.length - 1; // kıskaç: asla taşma
  const legendBar = view[hovI] || view[view.length - 1];
  const prevBar = view[Math.max(0, hovI - 1)] || legendBar;
  const chg = prevBar && prevBar.c ? ((legendBar.c - prevBar.c) / prevBar.c) * 100 : 0;
  const lastC = view[view.length - 1].c;

  // görünümdeki trade'ler + son trade (SL/TP çizimi için)
  const viewTrades = useMemo(() => (trades || []).filter(t => t.entryIdx >= off && t.entryIdx <= endIdx), [trades, off, endIdx]);
  const lastTrade = viewTrades.length ? viewTrades[viewTrades.length - 1] : null;

  // AK-044: karşılaştırma — ikinci sembolün % getirisi, birincinin fiyat eksenine ölçeklenip aynı grafiğe bindirilir
  const compareView = useMemo(() => (compareBars ? compareBars.slice(Math.max(0, off), off + view.length) : null), [compareBars, off, view.length]);
  const cmpLine = useMemo(() => {
    if (!compareView || compareView.length < 2 || !view.length) return null;
    const base = compareView[0].c || 1;
    const priceBase = view[0].c;
    return compareView.map((b, i) => ({ i, price: priceBase * (1 + (b.c - base) / base) }));
  }, [compareView, view]);

  // AK-044: serbest çizim araçları (trend çizgisi / dikdörtgen), sembol bazlı localStorage
  // AK-069: her çizime kalıcı id + locked bayrağı; seçim id ile yapılır (index değil — sıralama/silme
  // güvenli). Sağ-tık artık anında silmez, context menu açar (Kaldır/Klonla/Kilitle/Ayarlar).
  const [draws, setDraws] = useState([]);
  const [drawGhost, setDrawGhost] = useState(null);
  const [selectedDrawId, setSelectedDrawId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // {id, leftPct, topPct} — sağ-tık context menu
  // AK-085-TAMAMLAMA/C2: BOŞ ALAN bağlam menüsü — ctxMenu'den (çizim üstü) AYRI. Çizimlerin kendi
  // onContextMenu'sü (openCtxMenu, satır ~578/621) e.stopPropagation() çağırıyor, o yüzden bir
  // çizimin üstüne sağ-tıklanınca bu handler'a hiç ulaşmaz — iki menü doğal olarak çakışmaz.
  const [emptyCtxMenu, setEmptyCtxMenu] = useState(null); // {leftPct, topPct, i(global), price}
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`ak_draw_${symbol}`)) || [];
      setDraws(saved.map(d => ({ locked: false, ...d, id: d.id || uid() }))); // eski kayıtlarda id/locked yoktu — göçür
    } catch { setDraws([]); }
    setDrawGhost(null);
    setSelectedDrawId(null);
    setCtxMenu(null);
  }, [symbol]);
  useEffect(() => {
    try { localStorage.setItem(`ak_draw_${symbol}`, JSON.stringify(draws)); } catch { /* kotayı aşarsa sessiz geç */ }
    onDrawsChange && onDrawsChange(draws.length);
  }, [draws, symbol]);

  // AK-069: Delete/Backspace ile seçili çizimi sil (yazı alanı odaktaysa karışma)
  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKeyDown(e) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawId != null && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        removeDraw(selectedDrawId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDrawId, draws]); // eslint-disable-line

  // AK-069: context menu dışına tıklanınca kapansın
  useEffect(() => {
    if (!ctxMenu) return;
    function onDoc(e) { if (!e.target.closest?.(".ak-draw-ctxmenu")) setCtxMenu(null); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ctxMenu]);

  // AK-085-TAMAMLAMA/C2: boş-alan menüsü dışına tıklanınca/dokununca kapansın — aynı desen.
  useEffect(() => {
    if (!emptyCtxMenu) return;
    function onDoc(e) { if (!e.target.closest?.(".ak-chart-ctxmenu")) setEmptyCtxMenu(null); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [emptyCtxMenu]);

  function removeDraw(id) {
    const idx = draws.findIndex(d => d.id === id);
    if (idx === -1) return;
    const removed = draws[idx];
    if (removed.locked) return; // kilitli silinemez
    setDraws(ds => ds.filter(d => d.id !== id));
    setSelectedDrawId(s => (s === id ? null : s));
    onPushUndo?.({
      label: "çizim silindi",
      undo: () => setDraws(ds => { const next = ds.slice(); next.splice(Math.min(idx, next.length), 0, removed); return next; }),
      redo: () => setDraws(ds => ds.filter(d => d.id !== id)),
    });
  }
  function cloneDraw(id) {
    const d = draws.find(x => x.id === id);
    if (!d) return;
    const clone = { ...d, id: uid(), locked: false };
    if (clone.a) clone.a = { ...clone.a, i: clone.a.i + 3 };
    if (clone.b) clone.b = { ...clone.b, i: clone.b.i + 3 };
    if (clone.type === "position") clone.i = clone.i + 3;
    setDraws(ds => [...ds, clone]);
    setSelectedDrawId(clone.id);
  }
  function toggleLock(id) { setDraws(ds => ds.map(d => d.id === id ? { ...d, locked: !d.locked } : d)); }
  function updateDraw(id, patch) { setDraws(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d)); }
  // AK-085-TAMAMLAMA/C2: tüm çizimleri temizle — useImperativeHandle.clearDraws VE boş-alan
  // menüsünün "Çizimleri Temizle" kalemi AYNI fonksiyonu çağırır (yeniden yazılmaz, tek yerden).
  function clearAllDraws() { setDraws([]); setSelectedDrawId(null); setCtxMenu(null); setEmptyCtxMenu(null); }
  // Boş-alan menüsü kalemleri — hepsi ya var olan yeteneği (setDraws/setVView/onRangeSelect) ya da
  // parent'tan gelen (Lab.jsx sahipli) bir callback'i çağırır, yeni bir mantık icat edilmez.
  function resetChartView() { setVView(null); onRangeSelect && onRangeSelect(null); setEmptyCtxMenu(null); }
  function addHLineAt(price) { setDraws(ds => [...ds, { id: uid(), locked: false, type: "hline", price }]); setEmptyCtxMenu(null); }
  function addPositionAt(i, price) {
    const span = rg * 0.1;
    const newId = uid();
    setDraws(ds => [...ds, { id: newId, locked: false, type: "position", i, entry: price, tp: price + span * 2, sl: price - span }]);
    setSelectedDrawId(newId);
    setEmptyCtxMenu(null);
  }
  function drawStyle(d) {
    const s = { pointerEvents: "none" };
    if (d.color) s.stroke = d.color;
    if (d.width) s.strokeWidth = d.width;
    return s;
  }
  function openCtxMenu(e, id) {
    e.preventDefault(); e.stopPropagation();
    const r = svgRef.current.getBoundingClientRect();
    setSelectedDrawId(id);
    setCtxMenu({ id, leftPct: ((e.clientX - r.left) / r.width) * 100, topPct: ((e.clientY - r.top) / r.height) * 100 });
  }
  // Uç nokta tutamacı — kilitliyse render edilmez (sürüklenemez), which: "a"|"b"|"price"
  function renderHandle(cx, cy, id, which, locked) {
    if (locked) return null;
    return <circle cx={cx} cy={cy} r="5" className="ak-draw-handle" onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { mode: "drawHandle", id, which }; }} />;
  }
  // Floating toolbar'ın (HTML overlay, .ak-c-outer içinde) hangi viewBox noktasının üstünde
  // duracağını belirler — eski renderDelIcon konumlarıyla aynı mantık.
  function getDrawAnchor(d) {
    if (d.type === "hline") return { vx: W - pR - 60, vy: y(d.price) - 22 };
    if (d.type === "hray") { const x0 = x(gi(d.a.i)), yy = y(d.a.price); return { vx: (x0 + (W - pR)) / 2 - 50, vy: yy - 34 }; }
    if (d.type === "rect" || d.type === "trendline") {
      const x0 = x(gi(d.a.i)), y0 = y(d.a.price), x1 = x(gi(d.b.i)), y1 = y(d.b.price);
      return { vx: (x0 + x1) / 2 - 50, vy: Math.min(y0, y1) - 34 };
    }
    return null;
  }
  // AK-052: mobil "tek dokunuşla seç" korunur, artık id ile. AK-069: sağ-tık = context menu (anında silmez).
  // AK-071: "hline" (tam genişlik, tek fiyat) ve "hray" (bir bar konumundan sağ kenara ışın) — a/b nokta çifti gerektirmez.
  function renderDraw(d, key) {
    const isGhost = !d.id;
    const isSel = !isGhost && selectedDrawId === d.id;
    const evts = isGhost ? {} : {
      onContextMenu: (e) => openCtxMenu(e, d.id),
      onClick: (e) => { e.stopPropagation(); setCtxMenu(null); setSelectedDrawId(s => s === d.id ? null : d.id); },
    };

    if (d.type === "hline") {
      const yy = y(d.price);
      return (
        <g key={key}>
          <line x1={pL} y1={yy} x2={W - pR} y2={yy} className="ak-c-draw-hit" {...evts} />
          <line x1={pL} y1={yy} x2={W - pR} y2={yy} className={"ak-c-draw-hline" + (isSel ? " sel" : "")} style={drawStyle(d)} />
          {isSel && renderHandle(W - pR - 12, yy, d.id, "price", d.locked)}
        </g>
      );
    }
    if (d.type === "hray") {
      const x0 = x(gi(d.a.i)), yy = y(d.a.price);
      return (
        <g key={key}>
          <line x1={x0} y1={yy} x2={W - pR} y2={yy} className="ak-c-draw-hit" {...evts} />
          <line x1={x0} y1={yy} x2={W - pR} y2={yy} className={"ak-c-draw-hray" + (isSel ? " sel" : "")} style={drawStyle(d)} />
          <circle cx={x0} cy={yy} r="2.5" className={"ak-c-draw-hray-dot" + (isSel ? " sel" : "")} style={{ pointerEvents: "none" }} />
          {isSel && renderHandle(x0, yy, d.id, "a", d.locked)}
        </g>
      );
    }
    // AK-070: pozisyon aracı — giriş (orta), TP (yeşil kutu, üst/alt olabilir), SL (kırmızı kutu).
    // Üç çizgi de bağımsız sürüklenebilir (onMouseDown -> posdrag); R:R canlı, draws state'ten türetilir.
    // AK-069: kendi bespoke seçili-durum arayüzü korunur (floating toolbar/context menu bu tipe uygulanmaz).
    if (d.type === "position") {
      const biX = gi(d.i);
      const boxBars = Math.max(4, Math.min(30, view.length - biX));
      const x0 = x(biX), x1 = x(biX + boxBars);
      const yE = y(d.entry), yT = y(d.tp), yS = y(d.sl);
      const rr = Math.abs(d.tp - d.entry) / Math.max(1e-9, Math.abs(d.entry - d.sl));
      const dir = d.tp >= d.entry ? "Long" : "Short";
      const tpPct = (Math.abs(d.tp - d.entry) / d.entry) * 100;
      const slPct = (Math.abs(d.entry - d.sl) / d.entry) * 100;
      const startHandle = (handle) => (e) => { if (d.locked) return; e.stopPropagation(); dragRef.current = { mode: "posdrag", id: d.id, handle }; };
      return (
        <g key={key}>
          <rect x={x0} y={Math.min(yE, yT)} width={x1 - x0} height={Math.max(2, Math.abs(yE - yT))} className={"ak-c-pos-tp" + (isSel ? " sel" : "")} {...evts} />
          <rect x={x0} y={Math.min(yE, yS)} width={x1 - x0} height={Math.max(2, Math.abs(yE - yS))} className={"ak-c-pos-sl" + (isSel ? " sel" : "")} {...evts} />
          <line x1={x0} y1={yE} x2={x1} y2={yE} className="ak-c-pos-entry" style={{ pointerEvents: "none" }} />
          <line x1={x0} y1={yE - 6} x2={x1} y2={yE + 6} className="ak-c-draw-hit" onMouseDown={startHandle("entry")} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeDraw(d.id); }} />
          <line x1={x0} y1={yT - 6} x2={x1} y2={yT + 6} className="ak-c-draw-hit" onMouseDown={startHandle("tp")} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeDraw(d.id); }} />
          <line x1={x0} y1={yS - 6} x2={x1} y2={yS + 6} className="ak-c-draw-hit" onMouseDown={startHandle("sl")} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeDraw(d.id); }} />
          <text x={x0 + 3} y={yE - 4} className="ak-c-pos-lab entry">Giriş {fmtP(d.entry)}</text>
          <text x={x0 + 3} y={yT - 4} className="ak-c-pos-lab tp">TP {fmtP(d.tp)} (+{tpPct.toFixed(2)}%)</text>
          <text x={x0 + 3} y={yS + 11} className="ak-c-pos-lab sl">SL {fmtP(d.sl)} (-{slPct.toFixed(2)}%)</text>
          <text x={x0 + 3} y={Math.min(yT, yS) - 8} className="ak-c-pos-rr">{dir} · R:R 1:{rr.toFixed(2)}</text>
          {isSel && (() => {
            const cx = x1 + 10, cy = yE - 12;
            return (
              <g className="ak-c-draw-del" transform={`translate(${cx},${cy})`} onClick={(e) => { e.stopPropagation(); removeDraw(d.id); }}>
                <circle r="8" />
                <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" />
                <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" />
              </g>
            );
          })()}
          {isSel && onSandboxAdd && (
            <g className="ak-c-pos-btn" transform={`translate(${x1 + 10},${yE + 10})`} onClick={(e) => { e.stopPropagation(); onSandboxAdd(symbol, dir, Math.round(rr * 10) / 10); }}>
              <rect x="0" y="-11" width="122" height="22" rx="5" />
              <text x="61" y="4" textAnchor="middle">Sandbox'a emir oluştur</text>
            </g>
          )}
        </g>
      );
    }

    const x0 = x(gi(d.a.i)), y0 = y(d.a.price), x1 = x(gi(d.b.i)), y1 = y(d.b.price);
    // AK-087/C1: "İncele" seçimi — dikdörtgenle aynı görsel (kesikli kenar, yarı saydam dolgu), kalıcı değil.
    if (d.type === "inspect") {
      return <rect key={key} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} className="ak-c-inspect" />;
    }
    return (
      <g key={key}>
        {d.type === "rect"
          ? <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} className={"ak-c-draw-rect" + (isSel ? " sel" : "")} style={d.color ? { stroke: d.color } : undefined} {...evts} />
          : <>
              {/* görünmez geniş isabet şeridi — ince çizgiye sağ-tık/dokunuş zor olmasın diye */}
              <line x1={x0} y1={y0} x2={x1} y2={y1} className="ak-c-draw-hit" {...evts} />
              <line x1={x0} y1={y0} x2={x1} y2={y1} className={"ak-c-draw-line" + (isSel ? " sel" : "")} style={drawStyle(d)} />
            </>}
        {isSel && renderHandle(x0, y0, d.id, "a", d.locked)}
        {isSel && renderHandle(x1, y1, d.id, "b", d.locked)}
      </g>
    );
  }
  const selectedDrawObj = draws.find(d => d.id === selectedDrawId) || null;
  const selectedAnchor = selectedDrawObj && ["trendline", "rect", "hline", "hray"].includes(selectedDrawObj.type) ? getDrawAnchor(selectedDrawObj) : null;

  const cursorClass = spaceDown ? (handDragging ? " ak-c-grabbing" : " ak-c-grab") : "";
  // AK-097: size null iken (henüz ölçülmedi, bkz. ResizeObserver effect) ya da yetersiz veri
  // varken hiçbir şey ÇİZİLMEZ (W/H sıfır/negatif olabileceği için x()/y() güvenilmez olurdu).
  // ÖNEMLİ: <svg ref={svgRef}> HER ZAMAN aynı ağaç şeklinde (aynı .ak-c-outer > svg konumunda)
  // render edilir — ready false iken sadece İÇİNDEKİLER atlanır. Eskiden !ready durumunda ayrı/
  // daha sığ bir JSX döndürülüyordu (çıplak <svg>, .ak-c-outer sarmalayıcısı olmadan); React bunu
  // FARKLI bir ağaç sanıp eski svg DOM node'unu unmount edip yenisini mount ediyordu — bu da
  // ResizeObserver'ın (yalnızca mount anındaki node'u gözlemleyen) KOPMASINA yol açıyordu: ilk
  // (genelde 0×0 gelen) ölçüm sonrası bir daha asla tetiklenmiyordu. Tek/sabit ağaç bu kökten çözer.
  const ready = !!size && !!view && view.length >= 2;
  return (
    <div className="ak-c-outer">
    <svg id="ak-main-chart" ref={svgRef} className={"ak-chart" + cursorClass + (showRsi ? " has-rsi" : "")} viewBox={ready ? `0 0 ${W} ${svgH}` : "0 0 1 1"} role="img" aria-label="Fiyat grafiği"
      onMouseEnter={() => { overRef.current = true; }}
      onMouseMove={(e) => { onMove(e); onDrag(e); }}
      onMouseLeave={() => { overRef.current = false; setHov(null); setSel(null); if (dragRef.current?.mode === "pan") vFreezeRef.current = null; dragRef.current = null; setHandDragging(false); }}
      onMouseDown={onDown} onMouseUp={onUpSel} onDoubleClick={onDbl} onContextMenu={onCanvasContextMenu}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      {ready && <>
      {[0, .2, .4, .6, .8, 1].map((f, i) => {
        const py = pT + f * (H - pT - pB), pv = logScale ? Math.exp(lnHi - f * (lnHi - lnLo)) : ehi - f * erg;
        // AK-094 C4: mobilde 6 yerine 4 etiket — sıklığı azalt, tamamen kaldırma (i===1/.2 ve i===3/.6 gizlenir)
        const thin = i === 1 || i === 3;
        return <g key={i} className={thin ? "ak-c-grid-thin" : ""}><line x1={pL} y1={py} x2={W - pR} y2={py} className="ak-c-grid" /><text x={W - pR + 5} y={py + 3} className="ak-c-axis">{fmtP(pv)}</text></g>;
      })}

      {/* Zaman ekseni etiketleri (AK-030) */}
      {[0, .25, .5, .75, 1].map((f, i) => {
        const vi = Math.round(f * (slots - 1));
        return <text key={"tx" + i} x={x(vi)} y={H - 6} className="ak-c-time" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{labelAt(vi)}</text>;
      })}

      {/* Hacim çubukları (gerçek veri) */}
      {hasVol && view.map((b, i) => {
        const vh = ((b.v || 0) / maxV) * (H - pT - pB) * 0.16;
        return <rect key={"v" + i} x={x(i) - bw / 2} y={H - pB - vh} width={bw} height={Math.max(0.5, vh)} className={b.c >= b.o ? "ak-c-vol up" : "ak-c-vol dn"} />;
      })}

      {fvgs.map((g, k) => <rect key={"f" + k} x={x(gi(g.i))} y={y(g.hi)} width={Math.min(6, view.length - gi(g.i)) * step} height={Math.max(2, y(g.lo) - y(g.hi))} className={g.dir === 1 ? "ak-c-fvg up" : "ak-c-fvg dn"} />)}
      {obs.map((o, k) => <rect key={"o" + k} x={x(gi(o.i)) - bw} y={y(o.hi)} width={Math.min(7, view.length - gi(o.i)) * step} height={Math.max(2, y(o.lo) - y(o.hi))} className="ak-c-ob" />)}
      {bos.map((b, k) => <g key={"b" + k}><line x1={x(Math.max(0, gi(b.i) - 4))} y1={y(b.price)} x2={x(gi(b.i)) + step} y2={y(b.price)} className="ak-c-bos" /><text x={x(gi(b.i)) + step + 2} y={y(b.price) - 2} className="ak-c-boslab">BOS</text></g>)}
      {/* AK-087/C6: süpürme oku — seviye çizgisi + yönü gösteren küçük ok ucu */}
      {sweeps.map((s, k) => {
        const cx = x(gi(s.i)), cy = y(s.level);
        const pts = s.dir === 1 ? `${cx - 5},${cy + 8} ${cx + 5},${cy + 8} ${cx},${cy}` : `${cx - 5},${cy - 8} ${cx + 5},${cy - 8} ${cx},${cy}`;
        return (
          <g key={"sw" + k}>
            <line x1={x(Math.max(0, gi(s.i) - 5))} y1={cy} x2={x(gi(s.i)) + step} y2={cy} className="ak-c-sweep-line" />
            <polygon points={pts} className="ak-c-sweep-arrow" />
          </g>
        );
      })}

      {/* Fibonacci seviyeleri + indirim/primli bölge */}
      {fib && <g>
        <rect x={pL} y={y(Math.max(fib.ote.a, fib.ote.b))} width={W - pR - pL} height={Math.max(2, Math.abs(y(fib.ote.a) - y(fib.ote.b)))} className="ak-c-ote" />
        {fib.levels.map((lv, k) => <g key={"fi" + k}>
          <line x1={pL} y1={y(lv.price)} x2={W - pR} y2={y(lv.price)} className="ak-c-fib" />
          <text x={pL + 2} y={y(lv.price) - 2} className="ak-c-fiblab">{lv.r}</text>
        </g>)}
      </g>}

      {/* Order Flow şeridi (alt kenar) */}
      {ofArr && view.map((b, i) => {
        const d = ofArr[off + i];
        if (!d) return null;
        return <rect key={"of" + i} x={x(i) - bw / 2} y={H - pB - 5} width={bw} height={4} className={d === 1 ? "ak-c-of up" : "ak-c-of dn"} />;
      })}

      {maArrs.map((m) => (
        <polyline
          key={m.period}
          className="ak-c-ema"
          style={m.color ? { stroke: m.color } : undefined}
          points={m.arr.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        />
      ))}

      {(chartType === "line" || chartType === "area") ? (
        <g>
          {chartType === "area" && <polygon points={`${x(0)},${H - pB} ` + plotBars.map((b, i) => `${x(i)},${y(b.c)}`).join(" ") + ` ${x(plotBars.length - 1)},${H - pB}`} className="ak-c-area" />}
          <polyline className="ak-c-line" points={plotBars.map((b, i) => `${x(i)},${y(b.c)}`).join(" ")} />
        </g>
      ) : plotBars.map((b, i) => {
        const up = b.c >= b.o;
        return <g key={i} className={up ? "ak-c-up" : "ak-c-dn"}>
          <line x1={x(i)} y1={y(b.h)} x2={x(i)} y2={y(b.l)} className="ak-c-wick" />
          <rect x={x(i) - bw / 2} y={y(Math.max(b.o, b.c))} width={bw} height={Math.max(.8, Math.abs(y(b.o) - y(b.c)))} rx={Math.min(2, bw * 0.25)} className="ak-c-body" />
        </g>;
      })}

      {/* AK-056: görünümdeki en yüksek/en düşük bara fiyat etiketi — pan/zoom sonrası plotBars'tan yeniden bulunur */}
      {(() => {
        let hiI = 0, loI = 0;
        for (let i = 1; i < plotBars.length; i++) {
          if (plotBars[i].h > plotBars[hiI].h) hiI = i;
          if (plotBars[i].l < plotBars[loI].l) loI = i;
        }
        const anchorFor = (idx) => idx <= 1 ? "start" : idx >= plotBars.length - 2 ? "end" : "middle";
        const hiB = plotBars[hiI], loB = plotBars[loI];
        return (
          <g className="ak-c-hilo">
            <line x1={x(hiI)} y1={y(hiB.h) - 8} x2={x(hiI)} y2={y(hiB.h) - 2} className="ak-c-hitick" />
            <text x={x(hiI)} y={y(hiB.h) - 10} textAnchor={anchorFor(hiI)} className="ak-c-hilab">{fmtP(hiB.h)}</text>
            <line x1={x(loI)} y1={y(loB.l) + 2} x2={x(loI)} y2={y(loB.l) + 8} className="ak-c-hitick" />
            <text x={x(loI)} y={y(loB.l) + 19} textAnchor={anchorFor(loI)} className="ak-c-hilab">{fmtP(loB.l)}</text>
          </g>
        );
      })()}

      {/* AK-047: sarı yer imi (bookmark) — alt+tık ile konur, sürüklenebilir, çift tık = işarete dön */}
      {bookmark && (() => {
        const bx = x(gi(bookmark.barIndex)), by = y(bookmark.price);
        return (
          <g className="ak-c-bookmark-g">
            <line x1={bx} y1={pT} x2={bx} y2={H - pB} className="ak-c-bookmark-line" onDoubleClick={(e) => { e.stopPropagation(); goToBookmark(); }} />
            {/* AK-052: nişangah/+ tarzı, kompakt (eski 6px eşkenar dörtgenden küçük) */}
            <g className="ak-c-bookmark-mark" transform={`translate(${bx},${by})`}
              onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { mode: "bookmark" }; }}
              onDoubleClick={(e) => { e.stopPropagation(); goToBookmark(); }}
            >
              <circle r="7" className="ak-c-bookmark-hit" />
              <circle r="1.5" />
              <line x1="-4" y1="0" x2="-1.5" y2="0" />
              <line x1="1.5" y1="0" x2="4" y2="0" />
              <line x1="0" y1="-4" x2="0" y2="-1.5" />
              <line x1="0" y1="1.5" x2="0" y2="4" />
            </g>
          </g>
        );
      })()}

      {/* Karşılaştırma: ikinci sembolün normalize edilmiş getirisi (AK-044) */}
      {cmpLine && <polyline className="ak-c-cmp" points={cmpLine.map(p => `${x(p.i)},${y(p.price)}`).join(" ")} />}

      {/* Serbest çizimler (trend çizgisi / dikdörtgen) */}
      {draws.map((d) => renderDraw(d, d.id))}
      {drawGhost && renderDraw(drawGhost, "ghost")}

      {/* Mitigation işaretleri */}
      {mits.map((m, k) => {
        const cx = x(gi(m.i)), cy = y(m.price), r = 4;
        return <polygon key={"m" + k} points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} className="ak-c-mit" />;
      })}

      {/* trade giriş işaretleri */}
      {viewTrades.map((t, k) => {
        const cx = x(gi(t.entryIdx)), cy = y(t.entry);
        const tri = t.dir === 1 ? `${cx},${cy + 9} ${cx - 5},${cy + 17} ${cx + 5},${cy + 17}` : `${cx},${cy - 9} ${cx - 5},${cy - 17} ${cx + 5},${cy - 17}`;
        return <polygon key={"t" + k} points={tri} className={"ak-c-entry " + (t.outcome > 0 ? "win" : "loss")} />;
      })}

      {/* son trade: SL / TP çizgileri */}
      {lastTrade && <g>
        <line x1={x(gi(lastTrade.entryIdx))} y1={y(lastTrade.target)} x2={W - pR} y2={y(lastTrade.target)} className="ak-c-tp" />
        <text x={x(gi(lastTrade.entryIdx)) + 3} y={y(lastTrade.target) - 3} className="ak-c-tplab">TP</text>
        <line x1={x(gi(lastTrade.entryIdx))} y1={y(lastTrade.stop)} x2={W - pR} y2={y(lastTrade.stop)} className="ak-c-sl" />
        <text x={x(gi(lastTrade.entryIdx)) + 3} y={y(lastTrade.stop) + 11} className="ak-c-sllab">SL</text>
      </g>}
      {/* Son fiyat çizgisi + balonu (sağ eksen) */}
      <line x1={pL} y1={y(lastC)} x2={W - pR} y2={y(lastC)} className={view[view.length - 1].c >= view[view.length - 1].o ? "ak-c-lastline up" : "ak-c-lastline dn"} />
      <g className={view[view.length - 1].c >= view[view.length - 1].o ? "ak-c-lastp up" : "ak-c-lastp dn"}>
        <rect x={W - pR + 1} y={y(lastC) - 8} width={pR - 2} height={16} rx={3} />
        <text x={W - pR + 5} y={y(lastC) + 4}>{fmtP(lastC)}</text>
      </g>

      {/* Alan seçimi */}
      {sel && Math.abs(sel.b - sel.a) >= 1 && (
        <rect className="ak-c-sel" x={x(Math.min(sel.a, sel.b))} y={Math.min(sel.ya, sel.yb)} width={Math.abs(x(sel.b) - x(sel.a))} height={Math.max(2, Math.abs(sel.yb - sel.ya))} />
      )}

      {/* Crosshair */}
      {hov && <g className="ak-c-cross">
        <line x1={hov.px} y1={pT} x2={hov.px} y2={H - pB} />
        <line x1={pL} y1={hov.py} x2={W - pR} y2={hov.py} />
        <rect x={W - pR + 1} y={hov.py - 8} width={pR - 2} height={16} rx={3} className="ak-c-crossp" />
        <text x={W - pR + 5} y={hov.py + 4} className="ak-c-crosspt">{fmtP(hov.price)}</text>
        <rect x={hov.px - 26} y={H - pB + 2} width={52} height={15} rx={3} className="ak-c-crossp" />
        <text x={hov.px} y={H - pB + 13} textAnchor="middle" className="ak-c-crosspt">{labelAt(hov.i)}</text>
      </g>}

      {/* OHLC künyesi (TV tarzı, kompakt) */}
      <g className={"ak-c-legend " + (legendBar.c >= legendBar.o ? "up" : "dn")}>
        <text x={pL + 4} y={pT + 10}>
          O {fmtP(legendBar.o)}  Y {fmtP(legendBar.h)}  D {fmtP(legendBar.l)}  K {fmtP(legendBar.c)}  {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
        </text>
      </g>

      {/* AK-055: ayrı RSI paneli — hacim panelinin altında, 0-100 skala + 30/70 referans */}
      {showRsi && rsiView && (
        <g className="ak-c-rsi-g">
          <line x1={pL} y1={H} x2={W - pR} y2={H} className="ak-c-rsi-sep" />
          {[0, 30, 70, 100].map((v) => (
            <g key={"rl" + v}>
              <line x1={pL} y1={yRsi(v)} x2={W - pR} y2={yRsi(v)} className={"ak-c-rsi-grid" + (v === 30 || v === 70 ? " ref" : "")} />
              <text x={W - pR + 5} y={yRsi(v) + 3} className="ak-c-axis">{v}</text>
            </g>
          ))}
          <text x={pL + 4} y={rsiTop + 8} className="ak-c-rsi-label">RSI 14</text>
          <polyline
            className="ak-c-rsi-line"
            points={rsiView.map((v, i) => (v == null ? null : `${x(i)},${yRsi(v)}`)).filter(Boolean).join(" ")}
          />
        </g>
      )}
      </>}
    </svg>
    {ready && <>
    {/* AK-068: TradingView tarzı gösterge legend'ı — sol üst, OHLC künyesinin altında */}
    <ChartLegend
      indicators={indicators}
      onToggleShown={onIndicatorToggleShown}
      onRemove={onIndicatorRemove}
      onSetParam={onIndicatorSetParam}
      lastRemoved={lastRemovedIndicator}
      onUndoRemove={onUndoRemoveIndicator}
    />
    {/* AK-058: kağıt-işlem kutusu — Binance Long/Short kutusunun eğitim amaçlı, kaldıraçsız hali. Sandbox'a bağlı. */}
    <div className="ak-paperbox">
      <span className="ak-paperbox-note">Kağıt işlem — gerçek para değil</span>
      <div className="ak-paperbox-row">
        <input
          type="number" min="0.5" step="0.5" value={paperPlan}
          onChange={(e) => setPaperPlan(e.target.value)}
          title="Plan R:R"
        />
        <button className="ak-paperbox-long" onClick={() => paperTrade("Long")}>Long</button>
        <button className="ak-paperbox-short" onClick={() => paperTrade("Short")}>Short</button>
      </div>
    </div>
    {/* AK-069: çizim sağ-tık context menu — Kaldır/Klonla/Kilitle/Ayarlar */}
    {ctxMenu && (() => {
      const cd = draws.find(x => x.id === ctxMenu.id);
      if (!cd) return null;
      return (
        <div className="ak-draw-ctxmenu" style={{ left: ctxMenu.leftPct + "%", top: ctxMenu.topPct + "%" }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { removeDraw(ctxMenu.id); setCtxMenu(null); }} disabled={cd.locked}>Kaldır</button>
          <button onClick={() => { cloneDraw(ctxMenu.id); setCtxMenu(null); }}>Klonla</button>
          <button onClick={() => { toggleLock(ctxMenu.id); setCtxMenu(null); }}>{cd.locked ? "Kilidi Aç" : "Kilitle"}</button>
          <button onClick={() => setCtxMenu(null)}>Ayarlar</button>
        </div>
      );
    })()}
    {/* AK-085-TAMAMLAMA/C2: boş-alan bağlam menüsü — genel grafik aksiyonları */}
    {emptyCtxMenu && (
      <div className="ak-chart-ctxmenu" style={{ left: emptyCtxMenu.leftPct + "%", top: emptyCtxMenu.topPct + "%" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={resetChartView}>Grafiği Sıfırla</button>
        <button onClick={clearAllDraws}>Çizimleri Temizle</button>
        <button onClick={() => { onIndicatorsClear && onIndicatorsClear(); setEmptyCtxMenu(null); }}>Göstergeleri Kaldır</button>
        <button onClick={() => addHLineAt(emptyCtxMenu.price)}>Buraya Yatay Çizgi</button>
        <button onClick={() => addPositionAt(emptyCtxMenu.i, emptyCtxMenu.price)}>Buraya Pozisyon</button>
        <button onClick={() => { onOpenViewSettings && onOpenViewSettings(); setEmptyCtxMenu(null); }}>Görünüm Ayarları</button>
      </div>
    )}
    {/* AK-069: seçili çizim üstünde floating toolbar — renk, kalınlık, kilit, klon, çöp */}
    {selectedDrawObj && selectedAnchor && (
      <div className="ak-draw-toolbar" style={{ left: (selectedAnchor.vx / W) * 100 + "%", top: (selectedAnchor.vy / svgH) * 100 + "%" }} onClick={(e) => e.stopPropagation()}>
        {DRAW_COLORS.map((c) => (
          <button key={c} className="ak-draw-swatch" style={{ background: c }} title="Renk" onClick={() => updateDraw(selectedDrawObj.id, { color: c })} />
        ))}
        <span className="ak-draw-toolbar-sep" />
        {DRAW_WIDTHS.map((w) => (
          <button key={w} className={"ak-draw-wbtn" + ((selectedDrawObj.width || 1.6) === w ? " on" : "")} title={w === 1 ? "İnce" : w === 1.6 ? "Normal" : "Kalın"} onClick={() => updateDraw(selectedDrawObj.id, { width: w })}>
            <i style={{ height: Math.max(1, w) }} />
          </button>
        ))}
        <span className="ak-draw-toolbar-sep" />
        <button className={"ak-draw-lockbtn" + (selectedDrawObj.locked ? " on" : "")} title={selectedDrawObj.locked ? "Kilidi aç" : "Kilitle"} onClick={() => toggleLock(selectedDrawObj.id)}>
          {selectedDrawObj.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button title="Klonla" onClick={() => cloneDraw(selectedDrawObj.id)}><Copy size={12} /></button>
        <button title="Kaldır" disabled={selectedDrawObj.locked} onClick={() => removeDraw(selectedDrawObj.id)}><Trash2 size={12} /></button>
      </div>
    )}
    </>}
    </div>
  );
});

export default Chart;
