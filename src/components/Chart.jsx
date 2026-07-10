import { useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { findFVG, findOrderBlocks, findBOS, ema, findMitigation, orderFlowArr, findFib } from "../lib/detectors.js";

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

// Canlı mum grafiği + kavram katmanları. Tümü client-side (SVG).
// props: bars, concepts(array), showEma(bool), maxView(son N bar)
const Chart = forwardRef(function Chart({ bars, concepts = ["fvg"], showEma = true, maxView = 120, trades = null, range = null, onRangeSelect = null, logScale = false, magnet = true, chartType = "candle", symbol = "", drawMode = null, compareBars = null }, ref) {
  const hasR = range && range.start != null;
  const FUT = 120; // sağda gelecek boşluğu (fib/projeksiyon) — pencere son barı bu kadar aşabilir
  const rawEnd = hasR ? range.end : bars.length - 1;
  const futureSlots = Math.min(FUT, Math.max(0, rawEnd - (bars.length - 1)));
  const view = useMemo(() => hasR ? bars.slice(range.start, Math.min(rawEnd, bars.length - 1) + 1) : bars.slice(-maxView), [bars, maxView, hasR, range, rawEnd]);
  const off = hasR ? range.start : bars.length - view.length; // global -> view kaydırma
  // güvenlik: 2 bardan az görünüm çizilemez (bölme sıfıra düşer)
  const endIdx = off + view.length - 1;
  const emaArr = useMemo(() => (showEma ? ema(bars).slice(off, off + view.length) : null), [bars, showEma, off, view.length]);
  const inWin = i => i >= off && i <= endIdx;
  const fvgs = useMemo(() => concepts.includes("fvg") ? findFVG(bars).filter(g => inWin(g.i)) : [], [bars, concepts, off, endIdx]);
  const obs = useMemo(() => concepts.includes("ob") ? findOrderBlocks(bars).filter(o => inWin(o.i)) : [], [bars, concepts, off, endIdx]);
  const bos = useMemo(() => concepts.includes("bos") ? findBOS(bars).filter(b => inWin(b.i)) : [], [bars, concepts, off, endIdx]);
  const mits = useMemo(() => concepts.includes("mit") ? findMitigation(bars).filter(m => inWin(m.i)) : [], [bars, concepts, off, endIdx]);
  const ofArr = useMemo(() => concepts.includes("of") ? orderFlowArr(bars) : null, [bars, concepts]);
  const fib = useMemo(() => concepts.includes("fib") ? findFib(view, view.length) : null, [view, concepts]);
  // AK-044: Heikin-Ashi tüm seriden hesaplanır (önceki HA gövdesine bağımlı), sonra pencereye kırpılır
  const haFull = useMemo(() => chartType === "heikinashi" ? heikinAshi(bars) : null, [bars, chartType]);
  const plotBars = haFull ? haFull.slice(off, off + view.length) : view;

  const W = 1000, H = 480, pL = 6, pT = 12, pB = 26;
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
  useEffect(() => { setVView(null); }, [bars]); // sembol/veri değişince sıfırla
  const mid = vView ? vView.mid : (lo + hi) / 2;
  const half = vView ? vView.half : rg / 2;
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

  // Crosshair (AK-026): imleç -> bar/fiyat eşlemesi
  const [hov, setHov] = useState(null); // {i(view), px, py, price}
  useEffect(() => { setHov(null); }, [off, view.length]); // zoom/pan sonrası bayat indeks kalmasın
  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    if (px < pL || px > W - pR || py < pT || py > H - pB) { setHov(null); return; }
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
  }
  // AK-028b: imleç odaklı tekerlek zoom (native listener; passive:false şart)
  const svgRef = useRef(null);
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
      onRangeSelect(gs, gs + span - 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onRangeSelect]);

  // AK-044: dokunmatik pan (tek parmak) + pinch-zoom (iki parmak)
  const touchRef = useRef(null);
  const touchDist = (t0, t1) => Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  function onTouchStart(e) {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.touches.length === 2) {
      touchRef.current = { mode: "pinch", d0: touchDist(e.touches[0], e.touches[1]), off0: off, len0: view.length, total: bars.length };
      setHov(null);
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { mode: "pan", x0: t.clientX, off0: off, len0: view.length, total: bars.length, pxPerBar: r.width * ((W - pL - pR) / W) / view.length };
      const px = ((t.clientX - r.left) / r.width) * W, py = ((t.clientY - r.top) / r.height) * H;
      if (px >= pL && px <= W - pR && py >= pT && py <= H - pB) {
        const i = Math.max(0, Math.min(slots - 1, Math.round(((px - pL) / (W - pL - pR)) * (slots - 1))));
        let price = priceAt(py), snapPy = py;
        if (magnet) {
          const b = view[Math.min(i, view.length - 1)];
          if (b) { const cands = [b.o, b.h, b.l, b.c]; price = cands.reduce((best, v) => Math.abs(v - price) < Math.abs(best - price) ? v : best, cands[0]); snapPy = y(price); }
        }
        setHov({ i, px: x(i), py: snapPy, price });
      }
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length === 0) { touchRef.current = null; setHov(null); }
  }
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onRangeSelect) return;
    const onTouchMoveNative = (e) => {
      const d = touchRef.current;
      if (!d) return;
      e.preventDefault();
      if (d.mode === "pinch" && e.touches.length === 2) {
        const d1 = touchDist(e.touches[0], e.touches[1]);
        const ratio = d.d0 / Math.max(1, d1); // parmaklar açılınca (d1>d0) ratio<1 → yakınlaş (az bar)
        const span = Math.round(Math.min(d.total, Math.max(20, d.len0 * ratio)));
        const maxEnd = d.total - 1 + 120;
        const mid = d.off0 + d.len0 / 2;
        let gs = Math.round(mid - span / 2);
        gs = Math.max(0, Math.min(maxEnd - span + 1, gs));
        onRangeSelect(gs, gs + span - 1);
      } else if (d.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        const db = Math.round((d.x0 - t.clientX) / Math.max(0.5, d.pxPerBar));
        const maxEnd = d.total - 1 + 120;
        let gs = Math.max(0, Math.min(maxEnd - d.len0 + 1, d.off0 + db));
        onRangeSelect(gs, gs + d.len0 - 1);
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
    if (!bookmark) return;
    setVView({ mid: bookmark.price, half });
    if (onRangeSelect) {
      const width = view.length;
      const maxEnd = bars.length - 1 + 120;
      let gs = Math.round(bookmark.barIndex - width / 2);
      gs = Math.max(0, Math.min(maxEnd - width + 1, gs));
      onRangeSelect(gs, gs + width - 1);
    }
  }
  useImperativeHandle(ref, () => ({ goToBookmark }));

  // AK-030: sürükleme modları — varsayılan PAN (TV standardı), Shift+sürükle = alan seç,
  // sağ eksen üzerinde sürükle = dikey ölçek (fiyatı aç/kapa). Çift tık: grafikte tümü, eksende oto-sığdır.
  const [sel, setSel] = useState(null); // {a,b} view index (Shift seçimi)
  const dragRef = useRef(null);
  function onDown(e) {
    e.preventDefault(); // Shift+sürüklede tarayıcının metin seçimine girmesini engelle
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
      const a = { i: off + i, price: priceAt(py) };
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
        onRangeSelect(gs, gs + d.len0 - 1);
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
    } else if (d.mode === "pan" && onRangeSelect) {
      const db = Math.round((d.x0 - e.clientX) / Math.max(0.5, d.pxPerBar));
      const maxEnd = bars.length - 1 + 120;
      let gs = Math.max(0, Math.min(maxEnd - d.len0 + 1, d.off0 + db));
      onRangeSelect(gs, gs + d.len0 - 1);
    }
  }
  function onUpSel() {
    const d = dragRef.current;
    dragRef.current = null;
    setHandDragging(false);
    if (d?.mode === "draw") {
      const g = d.ghost;
      if (g && (g.a.i !== g.b.i || g.a.price !== g.b.price)) setDraws(ds => [...ds, g]);
      setDrawGhost(null);
      return;
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
  const [draws, setDraws] = useState([]);
  const [drawGhost, setDrawGhost] = useState(null);
  useEffect(() => {
    try { setDraws(JSON.parse(localStorage.getItem(`ak_draw_${symbol}`)) || []); } catch { setDraws([]); }
    setDrawGhost(null);
  }, [symbol]);
  useEffect(() => {
    try { localStorage.setItem(`ak_draw_${symbol}`, JSON.stringify(draws)); } catch { /* kotayı aşarsa sessiz geç */ }
  }, [draws, symbol]);
  function renderDraw(d, key) {
    const x0 = x(gi(d.a.i)), y0 = y(d.a.price), x1 = x(gi(d.b.i)), y1 = y(d.b.price);
    if (d.type === "rect") return <rect key={key} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} className="ak-c-draw-rect" />;
    return <line key={key} x1={x0} y1={y0} x2={x1} y2={y1} className="ak-c-draw-line" />;
  }

  if (!view || view.length < 2) return <svg className="ak-chart" viewBox={`0 0 1000 480`} />;

  const cursorClass = spaceDown ? (handDragging ? " ak-c-grabbing" : " ak-c-grab") : "";
  return (
    <svg id="ak-main-chart" ref={svgRef} className={"ak-chart" + cursorClass} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Fiyat grafiği"
      onMouseEnter={() => { overRef.current = true; }}
      onMouseMove={(e) => { onMove(e); onDrag(e); }}
      onMouseLeave={() => { overRef.current = false; setHov(null); setSel(null); dragRef.current = null; setHandDragging(false); }}
      onMouseDown={onDown} onMouseUp={onUpSel} onDoubleClick={onDbl} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      {[0, .2, .4, .6, .8, 1].map((f, i) => {
        const py = pT + f * (H - pT - pB), pv = logScale ? Math.exp(lnHi - f * (lnHi - lnLo)) : ehi - f * erg;
        return <g key={i}><line x1={pL} y1={py} x2={W - pR} y2={py} className="ak-c-grid" /><text x={W - pR + 5} y={py + 3} className="ak-c-axis">{fmtP(pv)}</text></g>;
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

      {emaArr && <polyline className="ak-c-ema" points={emaArr.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />}

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

      {/* AK-047: sarı yer imi (bookmark) — alt+tık ile konur, sürüklenebilir, çift tık = işarete dön */}
      {bookmark && (() => {
        const bx = x(gi(bookmark.barIndex)), by = y(bookmark.price);
        return (
          <g className="ak-c-bookmark-g">
            <line x1={pL} y1={by} x2={W - pR} y2={by} className="ak-c-bookmark-line" onDoubleClick={(e) => { e.stopPropagation(); goToBookmark(); }} />
            <polygon points={`${bx},${by - 6} ${bx + 6},${by} ${bx},${by + 6} ${bx - 6},${by}`} className="ak-c-bookmark-mark"
              onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { mode: "bookmark" }; }}
              onDoubleClick={(e) => { e.stopPropagation(); goToBookmark(); }}
            />
          </g>
        );
      })()}

      {/* Karşılaştırma: ikinci sembolün normalize edilmiş getirisi (AK-044) */}
      {cmpLine && <polyline className="ak-c-cmp" points={cmpLine.map(p => `${x(p.i)},${y(p.price)}`).join(" ")} />}

      {/* Serbest çizimler (trend çizgisi / dikdörtgen) */}
      {draws.map((d, k) => renderDraw(d, k))}
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
    </svg>
  );
});

export default Chart;
