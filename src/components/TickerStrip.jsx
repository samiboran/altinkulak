// AK-060: Izleme listesindeki gercek-veri sembollerini son fiyat+% ile yatayda kaydiran serit.
// Kaydirma CSS animasyonu (transform) ile yapilir; React re-render'a bagli degil, akici kalir.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBars, loadReal, isReal, hasData, ALL_SYMBOLS } from "../lib/data.js";

const WKEY = "ak_watch_v1";
function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(WKEY)) || ["BTC", "ETH", "SOL", "AVAX"]; }
  catch { return ["BTC", "ETH", "SOL", "AVAX"]; }
}

function fmtP(p) {
  const a = Math.abs(p);
  if (a >= 10000) return Math.round(p).toLocaleString("en-US");
  if (a >= 1000) return p.toFixed(0);
  if (a >= 100) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function TickerStrip() {
  const [list, setList] = useState(loadWatchlist);
  const [, setTick] = useState(0);

  // Izleme sayfasi listeyi degistirdiginde (baska sekme/pencere) senkron kal
  useEffect(() => {
    function onStorage(e) { if (e.key === WKEY) setList(loadWatchlist()); }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let on = true;
    Promise.all(list.map((s) => loadReal(s).catch(() => null)))
      .then((r) => { if (on && r.some(Boolean)) setTick((t) => t + 1); });
    return () => { on = false; };
  }, [list]);

  const rows = list
    .filter((sym) => hasData(sym) && isReal(sym))
    .map((sym) => {
      const b = getBars(sym);
      if (!b || b.length < 2) return null;
      const last = b[b.length - 1].c, prev = b[b.length - 2].c;
      const chg = ((last - prev) / prev) * 100;
      const meta = ALL_SYMBOLS.find((x) => x.sym === sym);
      return { sym, name: meta?.name || sym, last, chg };
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  const track = [...rows, ...rows]; // ikiye katla -> kesintisiz kaydirma

  return (
    <div className="ak-ticker">
      <div className="ak-ticker-track">
        {track.map((r, i) => (
          <Link to="/izleme" className="ak-ticker-item" key={r.sym + i}>
            <span className="sy">{r.sym}</span>
            <span className="last">{fmtP(r.last)}</span>
            <span className={"chg " + (r.chg >= 0 ? "pos" : "neg")}>
              {r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
