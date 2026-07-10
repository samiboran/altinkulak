import { useState, useEffect } from "react";
import { Eye, Plus, Trash2, ShieldCheck, Bell, BellRing } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal, isReal, hasData } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";
import { detectModBSignals } from "../lib/modB.js";
import { requestNotifyPermission, notify, isSeen, markSeen } from "../lib/notify.js";
import "../styles/izleme.css";

const WKEY = "ak_watch_v1";
const POLL_MS = 5 * 60 * 1000; // 5 dakika
function load() { try { return JSON.parse(localStorage.getItem(WKEY)) || ["BTC", "ETH", "SOL", "AVAX"]; } catch { return ["BTC"]; } }

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
  const [notifyPerm, setNotifyPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const [signals, setSignals] = useState([]);
  useEffect(() => { try { localStorage.setItem(WKEY, JSON.stringify(list)); } catch {} }, [list]);

  // AK-004b: listedeki gerçek-kaynaklı semboller arka planda yüklenir
  useEffect(() => {
    let on = true;
    Promise.all(list.map((s) => loadReal(s).catch(() => null)))
      .then((r) => { if (on && r.some(Boolean)) setDataV(v => v + 1); });
    return () => { on = false; };
  }, [list]);

  const fmtP = (p) => {
    const a = Math.abs(p);
    if (a >= 10000) return Math.round(p).toLocaleString("en-US");
    if (a >= 1000) return p.toFixed(0);
    if (a >= 100) return p.toFixed(1);
    if (a >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  // AK-042: Mod B v1.1 canlı sinyal taraması — sekme açıkken 5dk'da bir, yalnız bu tarayıcıda bildirim.
  useEffect(() => {
    let on = true;
    function scan() {
      const all = [];
      for (const sym of list) {
        if (!hasData(sym)) continue;
        const b = getBars(sym);
        if (!b || b.length < 60) continue;
        all.push(...detectModBSignals(b, sym));
      }
      all.sort((a, b) => (b.time || 0) - (a.time || 0));
      const top = all.slice(0, 10);
      if (!on) return;
      setSignals(top);
      for (const s of top) {
        if (!isSeen(s.id)) {
          markSeen(s.id);
          notify(
            `Mod B sinyali: ${s.sym} ${s.dir === 1 ? "LONG" : "SHORT"}`,
            `Giriş ${fmtP(s.entry)} · Stop ${fmtP(s.stop)} · Hedef1 ${fmtP(s.hedef1)}`
          );
        }
      }
    }
    scan();
    const id = setInterval(scan, POLL_MS);
    return () => { on = false; clearInterval(id); };
  }, [list]);

  async function enableNotify() { setNotifyPerm(await requestNotifyPermission()); }

  function add() { const s = q.trim().toUpperCase(); if (s && !list.includes(s)) setList(l => [...l, s]); setQ(""); }
  function del(s) { setList(l => l.filter(x => x !== s)); }

  const rows = list.map(sym => {
    if (!hasData(sym)) return { sym, bad: true }; // ne gerçek ne tanımlı sentetik -> "veri yok" (sahte edge yakma!)
    const b = getBars(sym);
    if (!b || b.length < 60) return { sym, bad: true };
    const last = b[b.length - 1].c, prev = b[b.length - 2].c, chg = ((last - prev) / prev) * 100;
    const r = runBacktest(b, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
    const meta = ALL_SYMBOLS.find(x => x.sym === sym);
    return { sym, name: meta?.name || sym, group: meta?.group || "—", real: isReal(sym), last, chg, t: r.tStat, edge: r.verdict.good };
  });

  return (
    <div className="ak-izle">
      <span className="ak-eyebrow">İZLEME LİSTESİ</span>
      <h1>Takibindekiler</h1>
      <p className="ak-izle-lead">Semboller, son fiyat, mini grafik ve "şu an FVG edge'i var mı" rozeti. Liste bu cihazda saklanır.</p>

      <div className="ak-izle-notify">
        <button
          className="ak-btn ak-btn-secondary sm"
          onClick={enableNotify}
          disabled={notifyPerm === "granted" || notifyPerm === "unsupported"}
        >
          {notifyPerm === "granted" ? <><BellRing size={14} /> Bildirimler açık</> : <><Bell size={14} /> Bildirimleri Aç</>}
        </button>
        <span className="ak-izle-notify-note">Mod B v1.1 (EMA50 bias + sıkı FVG + OTE 0.618 + onay mumu) sinyali oluşunca, yalnız bu sekme açıkken bildirim gelir.</span>
      </div>

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
            <div className="ak-wrow bad" key={r.sym}><span className="sy">{r.sym}</span><span className="nm">veri yok — Binance'te {r.sym}USDT bulunamadı, sentetik profili de tanımlı değil</span><button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button></div>
          ) : (
            <div className="ak-wrow" key={r.sym}>
              <div className="ak-wid"><span className="sy">{r.sym}</span><span className="nm">{r.name} · {r.group} <i className={"src" + (r.real ? " real" : "")}>{r.real ? "● gerçek" : "○ örnek"}</i></span></div>
              <Spark sym={r.sym} />
              <span className="last">{fmtP(r.last)}</span>
              <span className={"chg " + (r.chg >= 0 ? "pos" : "neg")}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
              <span className={"edge " + (r.edge ? "on" : "")}>{r.edge ? <><ShieldCheck size={12} /> edge t={r.t}</> : `t=${r.t}`}</span>
              <button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="ak-izle-note">● = gerçek veri (Binance 4H — listedeki HERHANGİ bir kripto sembolü SEMBOL+USDT olarak denenir) · ○ = örnek veri. Edge rozeti geçmiş 900 barın ölçümüdür, gelecek vaadi ve yatırım tavsiyesi değildir.</p>

      {signals.length > 0 && (
        <div className="ak-signals">
          <h2>Son Sinyaller <span className="ak-soon">Mod B v1.1</span></h2>
          <div className="ak-signal-list">
            {signals.map((s) => (
              <div className={"ak-signal-row " + (s.dir === 1 ? "long" : "short")} key={s.id}>
                <span className="sy">{s.sym}</span>
                <span className="dir">{s.dir === 1 ? "LONG" : "SHORT"}</span>
                <span className="lv">Giriş <b>{fmtP(s.entry)}</b></span>
                <span className="lv">Stop <b>{fmtP(s.stop)}</b></span>
                <span className="lv">Hedef1 <b>{fmtP(s.hedef1)}</b></span>
                <span className="lv">Hedef2 <b>{fmtP(s.hedef2)}</b></span>
              </div>
            ))}
          </div>
          <p className="ak-izle-note">Bu simülasyon/eğitim amaçlıdır; yatırım tavsiyesi değildir. Hedef1'de plan %50 kısmi çıkış öngörür.</p>
        </div>
      )}
    </div>
  );
}
