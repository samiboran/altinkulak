import { useMemo } from "react";
import { findFVG, findOrderBlocks, findBOS, ema, findMitigation, orderFlowArr, findFib } from "../lib/detectors.js";

// Canlı mum grafiği + kavram katmanları. Tümü client-side (SVG).
// props: bars, concepts(array), showEma(bool), maxView(son N bar)
export default function Chart({ bars, concepts = ["fvg"], showEma = true, maxView = 120, trades = null, range = null }) {
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

  const W = 1000, H = 340, pL = 6, pR = 52, pT = 12, pB = 16;
  const lo = Math.min(...view.map(b => b.l)), hi = Math.max(...view.map(b => b.h)), rg = hi - lo || 1;
  const x = i => pL + (i / (view.length - 1)) * (W - pL - pR);
  const y = p => pT + (1 - (p - lo) / rg) * (H - pT - pB);
  const step = (W - pL - pR) / view.length, bw = Math.max(1.6, step * 0.62);
  const gi = i => i - off; // global index -> view x index

  // görünümdeki trade'ler + son trade (SL/TP çizimi için)
  const viewTrades = useMemo(() => (trades || []).filter(t => t.entryIdx >= off && t.entryIdx <= endIdx), [trades, off, endIdx]);
  const lastTrade = viewTrades.length ? viewTrades[viewTrades.length - 1] : null;

  return (
    <svg className="ak-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Fiyat grafiği">
      {[0, .25, .5, .75, 1].map((f, i) => {
        const py = pT + f * (H - pT - pB), pv = hi - f * rg;
        return <g key={i}><line x1={pL} y1={py} x2={W - pR} y2={py} className="ak-c-grid" /><text x={W - pR + 5} y={py + 3} className="ak-c-axis">{pv.toFixed(1)}</text></g>;
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
    </svg>
  );
}
