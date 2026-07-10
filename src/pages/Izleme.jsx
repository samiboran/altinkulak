import { useState, useEffect } from "react";
import { Eye, Plus, Trash2, ShieldCheck, Bell, BellRing, Settings } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal, isReal, hasData } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";
import { detectModBSignals, DEFAULT_PARAMS } from "../lib/modB.js";
import { requestNotifyPermission, notify, isSeen, markSeen } from "../lib/notify.js";
import "../styles/izleme.css";

const WKEY = "ak_watch_v1";
const SKEY = "ak_my_system_v1";
const POLL_MS = 5 * 60 * 1000; // 5 dakika
function load() { try { return JSON.parse(localStorage.getItem(WKEY)) || ["BTC", "ETH", "SOL", "AVAX"]; } catch { return ["BTC"]; } }
function loadSystem() {
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY));
    if (saved && typeof saved === "object") return { name: "Sistemim", ...DEFAULT_PARAMS, ...saved };
  } catch {}
  return { name: "Sistemim", ...DEFAULT_PARAMS };
}

// AK-048: goreli zaman. s.time gercek epoch ms degilse (mock/ornek veride barIndex'e duser,
// yani 1e12'den kucuktur) sessizce null doner — yanlis tarih gostermektense hic gostermemek.
function timeAgo(ms) {
  if (!ms || ms < 1e12) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return null;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa ${min % 60} dk önce`;
  return `${Math.floor(hr / 24)} gün önce`;
}

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
  const [system, setSystem] = useState(loadSystem);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => { try { localStorage.setItem(WKEY, JSON.stringify(list)); } catch {} }, [list]);
  useEffect(() => { try { localStorage.setItem(SKEY, JSON.stringify(system)); } catch {} }, [system]);

  // AK-048: dakikada bir "X dk önce" metnini tazele — signals dizisi yeniden hesaplanmaz
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

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

  // AK-049: kullanıcının kendi ayarladığı "Sistemim" ile canlı sinyal taraması — sekme açıkken 5dk'da bir, yalnız bu tarayıcıda bildirim.
  useEffect(() => {
    let on = true;
    function scan() {
      const all = [];
      for (const sym of list) {
        if (!hasData(sym)) continue;
        const b = getBars(sym);
        if (!b || b.length < 60) continue;
        all.push(...detectModBSignals(b, sym, system));
      }
      all.sort((a, b) => (b.time || 0) - (a.time || 0));
      const top = all.slice(0, 10);
      if (!on) return;
      setSignals(top);
      for (const s of top) {
        if (!isSeen(s.id)) {
          markSeen(s.id);
          notify(
            `${system.name || "Sistemim"}: ${s.sym} ${s.dir === 1 ? "LONG" : "SHORT"}`,
            `Giriş ${fmtP(s.entry)} · Stop ${fmtP(s.stop)} · Hedef1 ${fmtP(s.hedef1)}`
          );
        }
      }
    }
    scan();
    const id = setInterval(scan, POLL_MS);
    return () => { on = false; clearInterval(id); };
  }, [list, system]);

  async function enableNotify() { setNotifyPerm(await requestNotifyPermission()); }

  function add() { const s = q.trim().toUpperCase(); if (s && !list.includes(s)) setList(l => [...l, s]); setQ(""); }
  function del(s) { setList(l => l.filter(x => x !== s)); }
  function setParam(key, val) { setSystem(s => ({ ...s, [key]: val })); }
  function resetSystem() { setSystem({ name: "Sistemim", ...DEFAULT_PARAMS }); }

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
        <button className="ak-btn ak-btn-secondary sm" onClick={() => setShowSettings(v => !v)}>
          <Settings size={14} /> {system.name || "Sistemim"}
        </button>
        <span className="ak-izle-notify-note">"{system.name || "Sistemim"}" kuralına uyan sinyal oluşunca, yalnız bu sekme açıkken bildirim gelir.</span>
      </div>

      {showSettings && (
        <div className="ak-sys-panel">
          <p className="ak-sys-warn">Bu SİZİN ayarlarınız, yalnızca bu tarayıcıda saklanır — başka hiçbir kullanıcı sizinkini görmez. Varsayılan değerler geçmişte doğrulanmış bir <b>başlangıç şablonudur</b>, resmi Altınkulak tavsiyesi değildir.</p>
          <label className="ak-sys-field">
            <span>Sistem adı</span>
            <input type="text" value={system.name || ""} onChange={e => setParam("name", e.target.value)} placeholder="Sistemim" maxLength={40} />
          </label>
          <label className="ak-sys-field">
            <span>ATR çarpanı (FVG sıkılığı) — {system.maxGapAtr.toFixed(2)}</span>
            <input type="range" min="0.1" max="1" step="0.05" value={system.maxGapAtr} onChange={e => setParam("maxGapAtr", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>Risk (R = ATR14 × ) — {system.riskMult.toFixed(1)}</span>
            <input type="range" min="0.5" max="4" step="0.1" value={system.riskMult} onChange={e => setParam("riskMult", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>EMA periyodu — {system.emaPeriod}</span>
            <input type="range" min="10" max="200" step="5" value={system.emaPeriod} onChange={e => setParam("emaPeriod", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>Fib/OTE seviyesi — {system.fibLevel.toFixed(3)}</span>
            <input type="range" min="0.5" max="0.786" step="0.001" value={system.fibLevel} onChange={e => setParam("fibLevel", Number(e.target.value))} />
          </label>
          <button className="ak-btn ak-btn-secondary sm" onClick={resetSystem}>Varsayılana dön</button>
        </div>
      )}

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
          <h2>{system.name || "Sistemim"} Sinyalleri <span className="ak-soon">kişisel ayar</span></h2>
          <div className="ak-signal-list">
            {signals.map((s) => (
              <div className={"ak-signal-row " + (s.dir === 1 ? "long" : "short")} key={s.id}>
                <span className="sy">{s.sym}</span>
                <span className="dir">{s.dir === 1 ? "LONG" : "SHORT"}</span>
                <span className="lv">Giriş <b>{fmtP(s.entry)}</b></span>
                <span className="lv">Stop <b>{fmtP(s.stop)}</b></span>
                <span className="lv">Hedef1 <b>{fmtP(s.hedef1)}</b></span>
                <span className="lv">Hedef2 <b>{fmtP(s.hedef2)}</b></span>
                {timeAgo(s.time) && <span className="ago" title={new Date(s.time).toLocaleString("tr-TR")}>{timeAgo(s.time)}</span>}
              </div>
            ))}
          </div>
          <p className="ak-izle-note">Bu simülasyon/eğitim amaçlıdır; yatırım tavsiyesi değildir, kendi ayarladığınız kişisel kuralın çıktısıdır. Hedef1'de plan %50 kısmi çıkış öngörür.</p>
        </div>
      )}
    </div>
  );
}
