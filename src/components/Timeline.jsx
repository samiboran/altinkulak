import { useRef, useEffect, useMemo } from "react";
import { Droplets, BarChart3, Sparkles } from "lucide-react";
import { findFVG } from "../lib/detectors.js";

const MONTHS = ["Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara", "Oca", "Şub", "Mar", "Nis", "May", "Haz"];
const LANES = [["liq", "Likidite", Droplets], ["vol", "Hacim", BarChart3], ["fvg", "FVG yoğ.", Sparkles]];

// Premiere usulü tarih kaydırıcı: çift perde kolu + ay etiketleri + katman şeritleri.
// props: bars, win{s,e} (0..1), onChange, lanes(array), lanesOn(bool), onToggleLane, drag state içeride.
export default function Timeline({ bars, win, onChange, lanes = ["liq"], lanesOn = true, onToggleLane }) {
  const ovRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    function move(e) {
      if (!dragRef.current || !ovRef.current) return;
      const r = ovRef.current.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const d = dragRef.current;
      if (d === "l") onChange({ s: Math.min(f, win.e - 0.05), e: win.e });
      else if (d === "r") onChange({ s: win.s, e: Math.max(f, win.s + 0.05) });
      else { const half = (win.e - win.s) / 2, c = Math.max(half, Math.min(1 - half, f)); onChange({ s: c - half, e: c + half }); }
    }
    function up() { dragRef.current = null; }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [win, onChange]);

  const closes = bars.map(b => b.c);
  const cLo = Math.min(...closes), cHi = Math.max(...closes), cRg = cHi - cLo || 1;
  const spark = useMemo(() => closes.map((c, i) => `${i},${40 - ((c - cLo) / cRg) * 38 - 1}`).join(" "), [bars]);
  const fvgSet = useMemo(() => new Set(findFVG(bars).map(g => g.i)), [bars]);

  const si = Math.floor(win.s * bars.length), ei = Math.ceil(win.e * bars.length);
  const slice = bars.slice(si, ei);

  return (
    <div className="ak-tl">
      <div className="ak-ov" ref={ovRef}>
        <svg className="ak-spark" viewBox={`0 0 ${bars.length} 40`} preserveAspectRatio="none"><polyline points={spark} /></svg>
        <div className="ak-mask" style={{ left: 0, width: `${win.s * 100}%` }} />
        <div className="ak-mask" style={{ right: 0, width: `${(1 - win.e) * 100}%` }} />
        <div className="ak-win" style={{ left: `${win.s * 100}%`, width: `${(win.e - win.s) * 100}%` }}
          onPointerDown={() => { dragRef.current = "mid"; }} />
        <div className="ak-handle" style={{ left: `${win.s * 100}%` }} onPointerDown={(e) => { e.stopPropagation(); dragRef.current = "l"; }}><span /></div>
        <div className="ak-handle" style={{ left: `${win.e * 100}%` }} onPointerDown={(e) => { e.stopPropagation(); dragRef.current = "r"; }}><span /></div>
      </div>
      <div className="ak-months">{MONTHS.map(m => <span key={m}>{m}</span>)}</div>

      {lanesOn && (
        <div className="ak-lanes">
          <div className="ak-lanepick">
            {LANES.map(([k, l, Icon]) => (
              <button key={k} className={"ak-lp" + (lanes.includes(k) ? " on" : "")} onClick={() => onToggleLane(k)}><Icon size={11} /> {l}</button>
            ))}
          </div>
          {lanes.map(k => {
            const meta = LANES.find(z => z[0] === k);
            return (
              <div className="ak-lane" key={k}>
                <span className="ak-lname">{meta[1]}</span>
                <svg className="ak-lsvg" viewBox={`0 0 ${slice.length} 22`} preserveAspectRatio="none">
                  {slice.map((b, i) => {
                    const gi = si + i;
                    const val = k === "liq" ? (0.3 + ((b.h - b.l) / b.c) * 14) : k === "vol" ? (0.3 + Math.abs(b.c - b.o) / b.c * 16) : (fvgSet.has(gi) ? 1 : 0.06);
                    const v = Math.max(0.04, Math.min(1, val));
                    return <rect key={i} x={i} y={22 - v * 21} width={0.85} height={v * 21} className={"ak-bar " + k} />;
                  })}
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
