import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, GitFork, Plus, Trash2, TrendingUp, Wallet, Award, UserX } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal } from "../lib/data.js";
import { MEMBERS, STRATEGIES, edgeScore } from "../lib/communityData.js";
import "../styles/profil.css";

const PKEY = "ak_portfolio_v1";
function loadP() { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } }
function saveP(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {} }

// sembol veri setinde var mı?
function inDataset(sym) {
  return ALL_SYMBOLS.some(x => x.sym === sym.toUpperCase());
}

// güncel fiyat önceliği: manuel giriş > veri seti > maliyet
function priceOf(h) {
  if (h.manual != null && h.manual > 0) return h.manual;
  if (inDataset(h.sym)) {
    const b = getBars(h.sym.toUpperCase());
    return b[b.length - 1].c;
  }
  return h.cost;
}

export default function Profil() {
  const { handle = "elifquant" } = useParams();
  const member = MEMBERS[handle];
  // AK-054: bu handle'a ait gerçek stratejiler — sabit STRATS yerine communityData.js'ten filtrelenir
  const userStrats = useMemo(() => STRATEGIES.filter(s => s.user === handle), [handle]);
  const bestT = userStrats.length ? Math.max(...userStrats.map(s => s.t)) : 0;
  const verifiedCount = userStrats.filter(s => s.t >= 2).length; // t>=2 = motorun genelindeki "edge" eşiği
  const totalForks = userStrats.reduce((a, s) => a + s.forks, 0);
  const score = member ? edgeScore({ tStat: bestT, oosTrades: member.n }) : 0;

  const [tab, setTab] = useState("portfoy");
  const [port, setPort] = useState(loadP);
  const [f, setF] = useState({ sym: "", tur: "Kripto", adet: "", cost: "", manual: "" });

  const [, setDataV] = useState(0);
  useEffect(() => saveP(port), [port]);

  // AK-004b: portföydeki gerçek-kaynaklı sembollerin güncel fiyatı Binance'ten
  useEffect(() => {
    let on = true;
    Promise.all(port.map((h) => loadReal(h.sym).catch(() => null)))
      .then((r) => { if (on && r.some(Boolean)) setDataV(v => v + 1); });
    return () => { on = false; };
  }, [port]);

  function add() {
    const sym = f.sym.trim().toUpperCase(), adet = Number(f.adet), cost = Number(f.cost);
    const manual = Number(f.manual) > 0 ? Number(f.manual) : null;
    if (!sym || !adet || !cost) return;
    setPort(p => [...p, { id: Date.now(), sym, tur: f.tur, adet, cost, manual }]);
    setF({ sym: "", tur: f.tur, adet: "", cost: "", manual: "" });
  }
  function del(id) { setPort(p => p.filter(x => x.id !== id)); }
  function setManual(id, v) {
    const n = Number(v);
    setPort(p => p.map(x => x.id === id ? { ...x, manual: n > 0 ? n : null } : x));
  }

  if (!member) {
    return (
      <div className="ak-prof">
        <div className="ak-prof-missing">
          <UserX size={26} />
          <p>@{handle} adında bir kullanıcı yok.</p>
        </div>
      </div>
    );
  }

  const rows = port.map(h => {
    const cur = priceOf(h);
    const val = cur * h.adet, costVal = h.cost * h.adet, pnl = val - costVal, pnlPct = costVal ? (pnl / costVal) * 100 : 0;
    return { ...h, cur, val, pnl, pnlPct };
  });
  const total = rows.reduce((a, r) => a + r.val, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost * r.adet, 0);
  const totalPnl = total - totalCost, totalPct = totalCost ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div className="ak-prof">
      <div className="ak-prof-head">
        <div className="ak-prof-av">{handle[0].toUpperCase()}</div>
        <div className="ak-prof-id">
          <h1>@{handle}</h1>
          <div className="ak-prof-badges">
            <span className="ak-rank"><Award size={13} /> Edge Rütbesi: {member.edge} · Katkı: {member.contrib} <em style={{opacity:.55,fontStyle:"normal"}}>(demo)</em></span>
            <span className="ak-prof-meta">İstatistikle doğrulanmış {verifiedCount} strateji</span>
          </div>
        </div>
        <button className="ak-btn ak-btn-secondary">Takip et</button>
      </div>

      <div className="ak-prof-stats">
        <div className="ak-ps"><b>{userStrats.length ? bestT.toFixed(1) : "—"}</b><span>en iyi t-stat</span></div>
        <div className="ak-ps"><b>{verifiedCount}</b><span>doğrulanmış strateji</span></div>
        <div className="ak-ps"><b>{score}</b><span>edge skoru</span></div>
        <div className="ak-ps"><b>{totalForks}</b><span>fork</span></div>
      </div>

      <div className="ak-prof-tabs">
        <button className={tab === "portfoy" ? "on" : ""} onClick={() => setTab("portfoy")}><Wallet size={15} /> Portföy</button>
        <button className={tab === "strat" ? "on" : ""} onClick={() => setTab("strat")}><TrendingUp size={15} /> Stratejiler</button>
      </div>

      {tab === "portfoy" && (
        <div className="ak-port">
          <div className="ak-port-sum">
            <div><span className="k">Toplam değer</span><b>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>
            <div><span className="k">Toplam K/Z</span><b className={totalPnl >= 0 ? "pos" : "neg"}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%)</b></div>
            <div><span className="k">Pozisyon</span><b>{rows.length}</b></div>
          </div>

          <div className="ak-port-add">
            <input list="ak-syms" placeholder="Sembol (SOL, BTC, ASELS…)" value={f.sym} onChange={e => setF({ ...f, sym: e.target.value })} />
            <datalist id="ak-syms">{ALL_SYMBOLS.map(s => <option key={s.sym} value={s.sym}>{s.name}</option>)}</datalist>
            <select value={f.tur} onChange={e => setF({ ...f, tur: e.target.value })}><option>Kripto</option><option>Hisse</option></select>
            <input type="number" placeholder="Adet" value={f.adet} onChange={e => setF({ ...f, adet: e.target.value })} />
            <input type="number" placeholder="Ort. maliyet" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} />
            <input type="number" placeholder="Güncel fiyat (ops.)" value={f.manual} onChange={e => setF({ ...f, manual: e.target.value })} />
            <button className="ak-btn ak-btn-primary" onClick={add}><Plus size={15} /> Ekle</button>
          </div>

          {rows.length === 0 ? (
            <div className="ak-port-empty"><Wallet size={26} /><p>Portföyün boş. Sembol ekle — değer ve K/Z otomatik hesaplanır. Veriler bu cihazda saklanır.</p></div>
          ) : (
            <div className="ak-port-table">
              <div className="ak-port-h"><span>Sembol</span><span>Tür</span><span>Adet</span><span>Maliyet</span><span>Güncel</span><span>Değer</span><span>K/Z</span><span></span></div>
              {rows.map(r => (
                <div className="ak-port-r" key={r.id}>
                  <span className="sy">{r.sym}</span>
                  <span className="tu">{r.tur}</span>
                  <span className="mono">{r.adet}</span>
                  <span className="mono">{r.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  {(r.manual != null || !inDataset(r.sym)) ? (
                    <span className="mono"><input className="curin" type="number" value={r.manual ?? ""} placeholder="fiyat gir" onChange={e => setManual(r.id, e.target.value)} /></span>
                  ) : (
                    <span className="mono">{r.cur.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  )}
                  <span className="mono">${r.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className={"mono " + (r.pnl >= 0 ? "pos" : "neg")}>{r.pnl >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%</span>
                  <button className="ak-del" onClick={() => del(r.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="ak-port-note">Listedeki semboller örnek veri setinden fiyatlanır; canlı feed bağlanınca (AK-004b) gerçek olacak. Listede olmayan semboller ve manuel girilen fiyatlar tablodaki "Güncel" alanından güncellenir. Bu bir portföy takip aracıdır, yatırım tavsiyesi değildir.</p>
        </div>
      )}

      {tab === "strat" && (
        <div className="ak-prof-strats">
          {userStrats.length === 0 ? (
            <div className="ak-port-empty"><TrendingUp size={26} /><p>@{handle} henüz paylaşılmış bir strateji doğrulamadı.</p></div>
          ) : userStrats.map((s, i) => {
            const ok = s.t >= 2; // motor genelindeki "edge" eşiği
            return (
              <div className="ak-pstrat" key={i}>
                <ShieldCheck size={16} className={ok ? "ok" : "no"} />
                <span className="nm">{s.sym} · {s.setup} · 1:{s.rr}</span>
                <em className={"t " + (ok ? "ok" : "no")}>t = {s.t}</em>
                <span className="fk"><GitFork size={12} /> {s.forks}</span>
                <button className="ak-btn ak-btn-ghost">Fork'la</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
