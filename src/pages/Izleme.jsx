import { useState, useEffect } from "react";
import { Eye, Plus, Trash2, ShieldCheck } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal, isReal } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";
import "../styles/izleme.css";

const WKEY = "ak_watch_v1";
function load() { try { return JSON.parse(localStorage.getItem(WKEY)) || ["SOL", "BTC", "ASELS"]; } catch { return ["SOL"]; } }

function Spark({ sym }) {
  const b = getBars(sym).slice(-40).map(x => x.c);
  const lo = Math.min(...b), hi = Math.max(...b), rg = hi - lo || 1;
  const up = b[b.length - 1] >= b[0];
  const pts = b.map((c, i) => `${(i / (b.length - 1)) * 100},${30 - ((c - lo) / rg) * 28 - 1}`).join(" ");
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="ak-wspark"><polyline points={pts} className={up ? "up" : "dn"} /></svg>;
}

export default function Izleme() {
  const [list, setList] = useState(load);
  const [q, setQ] = useState("");
  const [, setDataV] = useState(0);
  useEffect(() => { try { localStorage.setItem(WKEY, JSON.stringify(list)); } catch {} }, [list]);

  // AK-004b: listedeki gerçek-kaynaklı semboller arka planda yüklenir
  useEffect(() => {
    let on = true;
    Promise.all(list.map((s) => loadReal(s).catch(() => null)))
      .then((r) => { if (on && r.some(Boolean)) setDataV(v => v + 1); });
    return () => { on = false; };
  }, [list]);

  function add() { const s = q.trim().toUpperCase(); if (s && !list.includes(s)) setList(l => [...l, s]); setQ(""); }
  function del(s) { setList(l => l.filter(x => x !== s)); }

  const rows = list.map(sym => {
    const b = getBars(sym);
    if (!b || b.length < 60) return { sym, bad: true };
    const last = b[b.length - 1].c, prev = b[b.length - 2].c, chg = ((last - prev) / prev) * 100;
    const r = runBacktest(b, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"] });
    const meta = ALL_SYMBOLS.find(x => x.sym === sym);
    return { sym, name: meta?.name || sym, group: meta?.group || "—", real: isReal(sym), last, chg, t: r.tStat, edge: r.verdict.good };
  });

  return (
    <div className="ak-izle">
      <span className="ak-eyebrow">İZLEME LİSTESİ</span>
      <h1>Takibindekiler</h1>
      <p className="ak-izle-lead">Semboller, son fiyat, mini grafik ve "şu an FVG edge'i var mı" rozeti. Liste bu cihazda saklanır.</p>

      <div className="ak-izle-add">
        <input list="ak-wsyms" placeholder="Sembol ekle (SOL, NVDA, GARAN…)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <datalist id="ak-wsyms">{ALL_SYMBOLS.map(s => <option key={s.sym} value={s.sym}>{s.name}</option>)}</datalist>
        <button className="ak-btn ak-btn-primary" onClick={add}><Plus size={15} /> Ekle</button>
      </div>

      {rows.length === 0 ? (
        <div className="ak-izle-empty"><Eye size={26} /><p>Liste boş. Sembol ekle.</p></div>
      ) : (
        <div className="ak-izle-list">
          {rows.map(r => r.bad ? (
            <div className="ak-wrow bad" key={r.sym}><span className="sy">{r.sym}</span><span className="nm">veri yok</span><button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button></div>
          ) : (
            <div className="ak-wrow" key={r.sym}>
              <div className="ak-wid"><span className="sy">{r.sym}</span><span className="nm">{r.name} · {r.group} <i className={"src" + (r.real ? " real" : "")}>{r.real ? "● gerçek" : "○ örnek"}</i></span></div>
              <Spark sym={r.sym} />
              <span className={"chg " + (r.chg >= 0 ? "pos" : "neg")}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
              <span className={"edge " + (r.edge ? "on" : "")}>{r.edge ? <><ShieldCheck size={12} /> edge t={r.t}</> : `t=${r.t}`}</span>
              <button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="ak-izle-note">● = gerçek veri (Binance 4H) · ○ = örnek veri. Edge rozeti geçmiş 900 barın ölçümüdür, gelecek vaadi ve yatırım tavsiyesi değildir.</p>
    </div>
  );
}
