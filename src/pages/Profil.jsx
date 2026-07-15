import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, Plus, Trash2, TrendingUp, Wallet, Award, UserX, UserPlus, UserCheck, Settings } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal } from "../lib/data.js";
import { useAuth } from "../lib/AuthProvider.jsx";
import { fetchProfileByHandle, fetchProfileById, fetchStrategiesByUser, fetchFollowState, followUser, unfollowUser } from "../lib/supabase.js";
import { listTrades } from "../lib/ledger.js";
import { edgeRank, contribRank } from "../lib/ranks.js";
import "../styles/profil.css";

// AK-077: Ben.jsx = mutfak (sandbox/sicil/parametreler, düzenlenebilir), Profil.jsx = vitrin (public,
// salt-okunur sonuç). Veri kaynağı artık communityData.js mock'u DEĞİL, Supabase profiles/strategies/
// follows — Supabase boşsa ya da yapılandırılmamışsa dürüst boş durum gösterilir, asla fabrike veri (D6).

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
  const { handle: routeHandle } = useParams();
  const handle = routeHandle || "elifquant"; // SSR duman testi/route'suz render için düşme değeri
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [strategies, setStrategies] = useState([]);
  const [myHandle, setMyHandle] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // C1: isOwner = giriş yapmış kullanıcının kendi handle'ı === bakılan sayfanın handle'ı
  const isOwner = !!user && myHandle === handle;

  useEffect(() => {
    let on = true;
    setProfileLoading(true);
    fetchProfileByHandle(handle).then((p) => { if (on) { setProfile(p); setProfileLoading(false); } });
    return () => { on = false; };
  }, [handle]);

  useEffect(() => {
    let on = true;
    if (!user) { setMyHandle(null); return; }
    fetchProfileById(user.id).then((p) => { if (on) setMyHandle(p?.handle || null); });
    return () => { on = false; };
  }, [user]);

  useEffect(() => {
    let on = true;
    if (!profile) { setStrategies([]); return; }
    fetchStrategiesByUser(profile.id).then((rows) => { if (on) setStrategies(rows); });
    return () => { on = false; };
  }, [profile]);

  useEffect(() => {
    let on = true;
    if (!user || !profile || isOwner) { setFollowing(false); return; }
    fetchFollowState(user.id, profile.id).then((f) => { if (on) setFollowing(f); });
    return () => { on = false; };
  }, [user, profile, isOwner]);

  async function toggleFollow() {
    if (!user || !profile || isOwner || followBusy) return;
    setFollowBusy(true);
    const next = !following;
    setFollowing(next); // D5: optimistic UI
    const ok = next ? await followUser(user.id, profile.id) : await unfollowUser(user.id, profile.id);
    if (!ok) setFollowing(!next); // istek başarısızsa geri al
    setFollowBusy(false);
  }

  // D1: Edge Rütbesi yerel sicilden (ledger.js) hesaplanır — bu SADECE bu cihazda, SADECE
  // profil sahibi için mevcuttur. Başka birinin sicili bu cihazdan asla görülemez/fabrike
  // edilemez (D6) — o yüzden isOwner değilken rozet hiç gösterilmez (boş bırakmak, uydurmaktan iyidir).
  const myEdge = isOwner ? edgeRank(listTrades()) : null;
  // AK-023 (davet ekonomisi) henüz veri üretmiyor — dürüst varsayılan: 0 puan = "Gözlemci".
  const contrib = contribRank(0);

  const [tab, setTab] = useState("strat");
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

  if (profileLoading) {
    return <div className="ak-prof"><p className="ak-prof-meta">Yükleniyor…</p></div>;
  }

  if (!profile) {
    return (
      <div className="ak-prof">
        <div className="ak-prof-missing">
          <UserX size={26} />
          <p>@{handle} adında bir kullanıcı yok.</p>
        </div>
      </div>
    );
  }

  // C2 (2): doğrulanmış istatistik bloğu — yalnız Supabase'teki public strategies'ten (n = toplam strateji sayısı)
  const bestT = strategies.length ? Math.max(...strategies.map(s => Number(s.oos_t) || 0)) : 0;
  const verifiedCount = strategies.filter(s => Number(s.oos_t) >= 2).length;

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
            {myEdge && <span className="ak-rank"><Award size={13} /> Edge Rütbesi: {myEdge.name}</span>}
            <span className="ak-rank teal"><Award size={13} /> Katkı: {contrib.name}</span>
            <span className="ak-prof-meta">İstatistikle doğrulanmış {verifiedCount} strateji</span>
          </div>
        </div>
        {isOwner ? (
          <button className="ak-btn ak-btn-secondary" disabled title="Yakında">
            <Settings size={14} /> Profili Düzenle
          </button>
        ) : (
          <button
            className="ak-btn ak-btn-secondary"
            onClick={toggleFollow}
            disabled={!user || followBusy}
            title={!user ? "Takip etmek için giriş yapmalısın" : undefined}
          >
            {following ? <><UserCheck size={14} /> Takip ediliyor</> : <><UserPlus size={14} /> Takip et</>}
          </button>
        )}
      </div>

      <div className="ak-prof-stats">
        <div className="ak-ps"><b>{strategies.length ? bestT.toFixed(1) : "—"}</b><span>en iyi t-stat</span></div>
        <div className="ak-ps"><b>{verifiedCount}</b><span>doğrulanmış strateji</span></div>
        <div className="ak-ps"><b>{strategies.length}</b><span>toplam strateji</span></div>
      </div>

      <div className="ak-prof-tabs">
        <button className={tab === "strat" ? "on" : ""} onClick={() => setTab("strat")}><TrendingUp size={15} /> Stratejiler</button>
        {/* D2: Portföy sekmesi yalnız sahibine — isOwner=false iken DOM'a hiç girmez */}
        {isOwner && <button className={tab === "portfoy" ? "on" : ""} onClick={() => setTab("portfoy")}><Wallet size={15} /> Portföy</button>}
      </div>

      {tab === "strat" && (
        <div className="ak-prof-strats">
          {strategies.length === 0 ? (
            <div className="ak-port-empty"><TrendingUp size={26} /><p>@{handle} henüz doğrulanmış bir strateji paylaşmadı.</p></div>
          ) : strategies.map((s) => {
            const ok = Number(s.oos_t) >= 2; // motor genelindeki "edge" eşiği
            return (
              // C3: sonuç kartı — sym/setup/t-stat/win_rate/OOS durumu. Parametre YOK, fork sayacı YOK (D3/D4).
              <div className="ak-pstrat" key={s.id}>
                <ShieldCheck size={16} className={ok ? "ok" : "no"} />
                <span className="nm">{s.sym} · {s.setup} · 1:{Number(s.rr).toFixed(1)}</span>
                <em className={"t " + (ok ? "ok" : "no")}>t = {Number(s.oos_t).toFixed(1)}</em>
                <span className="wr">win %{Number(s.win_rate).toFixed(0)}</span>
                {isOwner && (
                  // D4/D14: fork/referans sayacı yalnız sahibine özel bir insight — public hiç görmez.
                  <span className="ak-pstrat-priv">Bu strateji {s.forks || 0} kez referans alındı</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOwner && tab === "portfoy" && (
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
    </div>
  );
}
