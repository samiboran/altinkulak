import { useMemo, useState, useRef, useEffect } from "react";
import { findFVG, findOrderBlocks, findBOS, ema, findMitigation, orderFlowArr, findFib } from "../lib/detectors.js";

// Canlı mum grafiği + kavram katmanları. Tümü client-side (SVG).
// props: bars, concepts(array), showEma(bool), maxView(son N bar)
export default function Chart({ bars, concepts = ["fvg"], showEma = true, maxView = 120, trades = null, range = null, onRangeSelect = null, logScale = false }) {
  const hasR = range && range.start != null;
  const view = useMemo(() => hasR ? bars.slice(range.start, range.end + 1) : bars.slice(-maxView), [bars, maxView, hasR, range]);
  const off = hasR ? range.start : bars.length - view.length; // global -> view kaydırma
  const endIdx = off + view.length - 1;
  const emaArr = useMemo(() => (showEma ? ema(bars).slice(off, off + view.length) : null), [bars, showEma, off, view.length]);
  const inWin = i => i >= off && i <= endIdx;
  const fvgs = useMemo(() => concepts.includes("fvg") ? findFVG(bars).filter(g => inWin(g.i)) : [], [bars, concepts, off, endIdx]);
  const obs = useMemo(() => concepts.includes("ob") ? findOrderBlocks(bars).filter(o => inWin(o.i)) : [], [bars, concepts, off, endIdx]);
  const bos = useMemo(() => concepts.includes("bos") ? findBOS(bars).filter(b => inWin(b.i)) : [], [bars, concepts, off, endIdx]);
  const mits = useMemo(() => concepts.includes("mit") ? findMitigation(bars).filter(m => inWin(m.i)) : [], [bars, concepts, off, endIdx]);
  const ofArr = useMemo(() => concepts.includes("of") ? orderFlowArr(bars) : null, [bars, concepts]);
  const fib = useMemo(() => concepts.includes("fib") ? findFib(view, view.length) : null, [view, concepts]);

  const W = 1000, H = 340, pL = 6, pT = 12, pB = 26;
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
  const x = i => pL + (i / (view.length - 1)) * (W - pL - pR);
  // Dikey ölçek (AK-030): eksen sürüklenince vScale değişir (1 = otomatik sığdır). Log ölçek destekli.
  const [vScale, setVScale] = useState(1);
  useEffect(() => { setVScale(1); }, [bars]); // sembol/veri değişince sıfırla
  const mid = (lo + hi) / 2, half = (rg / 2) * vScale;
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
  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    if (px < pL || px > W - pR || py < pT || py > H - pB) { setHov(null); return; }
    const i = Math.max(0, Math.min(view.length - 1, Math.round(((px - pL) / (W - pL - pR)) * (view.length - 1))));
    const price = priceAt(py);
    setHov({ i, px: x(i), py, price });
  }
  // AK-028b: imleç odaklı tekerlek zoom (native listener; passive:false şart)
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  zoomRef.current = { off, len: view.length, total: bars.length, hov };
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onRangeSelect) return;
    const onWheel = (e) => {
      e.preventDefault();
      const { off, len, total, hov } = zoomRef.current;
      const anchorFrac = hov ? hov.i / Math.max(1, len - 1) : 0.5;
      const anchorG = off + Math.round(anchorFrac * (len - 1));
      const span = Math.round(Math.min(total, Math.max(20, len * (e.deltaY > 0 ? 1.25 : 0.8))));
      let gs = Math.round(anchorG - anchorFrac * span);
      gs = Math.max(0, Math.min(total - span, gs));
      onRangeSelect(gs, gs + span - 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onRangeSelect]);

  // AK-030: sürükleme modları — varsayılan PAN (TV standardı), Shift+sürükle = alan seç,
  // sağ eksen üzerinde sürükle = dikey ölçek (fiyatı aç/kapa). Çift tık: grafikte tümü, eksende oto-sığdır.
  const [sel, setSel] = useState(null); // {a,b} view index (Shift seçimi)
  const dragRef = useRef(null);
  function onDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px > W - pR) { dragRef.current = { mode: "axis", y0: e.clientY, v0: vScale }; return; }
    if (e.shiftKey && hov) { setSel({ a: hov.i, b: hov.i }); dragRef.current = { mode: "sel" }; return; }
    dragRef.current = { mode: "pan", x0: e.clientX, off0: off, len0: view.length, pxPerBar: r.width * ((W - pL - pR) / W) / view.length };
  }
  function onDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "axis") {
      const dy = e.clientY - d.y0;
      setVScale(Math.min(6, Math.max(0.2, d.v0 * Math.exp(dy * 0.004))));
    } else if (d.mode === "pan" && onRangeSelect) {
      const db = Math.round((d.x0 - e.clientX) / Math.max(0.5, d.pxPerBar));
      let gs = Math.max(0, Math.min(bars.length - d.len0, d.off0 + db));
      onRangeSelect(gs, gs + d.len0 - 1);
    }
  }
  function onUpSel() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.mode === "sel" && sel && onRangeSelect && Math.abs(sel.b - sel.a) >= 3) {
      const gs = off + Math.min(sel.a, sel.b), ge = off + Math.max(sel.a, sel.b);
      onRangeSelect(gs, ge);
    }
    setSel(null);
  }
  function onDbl(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px > W - pR) { setVScale(1); return; }
    setVScale(1);
    onRangeSelect && onRangeSelect(null);
  }

  const fmtT = (b, gi_) => b?.time
    ? new Date(b.time).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
    : "#" + gi_;
  const hasVol = view.some(b => b.v > 0);
  const maxV = hasVol ? Math.max(...view.map(b => b.v || 0)) : 1;

  const legendBar = hov ? view[hov.i] : view[view.length - 1];
  const prevBar = hov ? view[Math.max(0, hov.i - 1)] : view[Math.max(0, view.length - 2)];
  const chg = prevBar && prevBar.c ? ((legendBar.c - prevBar.c) / prevBar.c) * 100 : 0;
  const lastC = view[view.length - 1].c;

  // görünümdeki trade'ler + son trade (SL/TP çizimi için)
  const viewTrades = useMemo(() => (trades || []).filter(t => t.entryIdx >= off && t.entryIdx <= endIdx), [trades, off, endIdx]);
  const lastTrade = viewTrades.length ? viewTrades[viewTrades.length - 1] : null;

  return (
    <svg ref={svgRef} className="ak-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Fiyat grafiği" onMouseMove={(e) => { onMove(e); onDrag(e); if (dragRef.current?.mode === "sel" && hov) setSel(sl => sl && ({ ...sl, b: hov.i })); }} onMouseLeave={() => { setHov(null); setSel(null); dragRef.current = null; }} onMouseDown={onDown} onMouseUp={onUpSel} onDoubleClick={onDbl}>
      {[0, .2, .4, .6, .8, 1].map((f, i) => {
        const py = pT + f * (H - pT - pB), pv = logScale ? Math.exp(lnHi - f * (lnHi - lnLo)) : ehi - f * erg;
        return <g key={i}><line x1={pL} y1={py} x2={W - pR} y2={py} className="ak-c-grid" /><text x={W - pR + 5} y={py + 3} className="ak-c-axis">{fmtP(pv)}</text></g>;
      })}

      {/* Zaman ekseni etiketleri (AK-030) */}
      {[0, .25, .5, .75, 1].map((f, i) => {
        const vi = Math.round(f * (view.length - 1));
        return <text key={"tx" + i} x={x(vi)} y={H - 6} className="ak-c-time" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>{fmtT(view[vi], off + vi)}</text>;
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

      {view.map((b, i) => {
        const up = b.c >= b.o;
        return <g key={i} className={up ? "ak-c-up" : "ak-c-dn"}>
          <line x1={x(i)} y1={y(b.h)} x2={x(i)} y2={y(b.l)} className="ak-c-wick" />
          <rect x={x(i) - bw / 2} y={y(Math.max(b.o, b.c))} width={bw} height={Math.max(.8, Math.abs(y(b.o) - y(b.c)))} className="ak-c-body" />
        </g>;
      })}

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
        <rect className="ak-c-sel" x={x(Math.min(sel.a, sel.b))} y={pT} width={Math.abs(x(sel.b) - x(sel.a))} height={H - pT - pB} />
      )}

      {/* Crosshair */}
      {hov && <g className="ak-c-cross">
        <line x1={hov.px} y1={pT} x2={hov.px} y2={H - pB} />
        <line x1={pL} y1={hov.py} x2={W - pR} y2={hov.py} />
        <rect x={W - pR + 1} y={hov.py - 8} width={pR - 2} height={16} rx={3} className="ak-c-crossp" />
        <text x={W - pR + 5} y={hov.py + 4} className="ak-c-crosspt">{fmtP(hov.price)}</text>
        <rect x={hov.px - 26} y={H - pB + 2} width={52} height={15} rx={3} className="ak-c-crossp" />
        <text x={hov.px} y={H - pB + 13} textAnchor="middle" className="ak-c-crosspt">{fmtT(view[hov.i], off + hov.i)}</text>
      </g>}

      {/* OHLC künyesi (TV tarzı, kompakt) */}
      <g className={"ak-c-legend " + (legendBar.c >= legendBar.o ? "up" : "dn")}>
        <text x={pL + 4} y={pT + 10}>
          O {fmtP(legendBar.o)}  Y {fmtP(legendBar.h)}  D {fmtP(legendBar.l)}  K {fmtP(legendBar.c)}  {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
        </text>
      </g>
    </svg>
  );
}
