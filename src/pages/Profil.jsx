import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, TrendingUp, Wallet, Award, UserX, UserPlus, UserCheck, Settings, Lock } from "lucide-react";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { fetchProfileByHandle, fetchProfileById, fetchStrategiesByUser, fetchFollowState, followUser, unfollowUser } from "../lib/supabase.js";
import { listTrades } from "../lib/ledger.js";
import { edgeRank, contribRank } from "../lib/ranks.js";
import PortfolioPanel from "../components/PortfolioPanel.jsx";
import "../styles/profil.css";

// AK-077: Ben.jsx = mutfak (sandbox/sicil/parametreler, düzenlenebilir), Profil.jsx = vitrin (public,
// salt-okunur sonuç). Veri kaynağı artık communityData.js mock'u DEĞİL, Supabase profiles/strategies/
// follows — Supabase boşsa ya da yapılandırılmamışsa dürüst boş durum gösterilir, asla fabrike veri (D6).
// AK-078: Portföy sekmesi artık PortfolioPanel.jsx'e taşındı (event sourcing, ağırlıklı ort. maliyet,
// USD normalize, gizlilik modu, ₺/$ — bkz. src/lib/portfolio.js).

export default function Profil() {
  const { handle: routeHandle } = useParams();
  const handle = routeHandle || "elifquant"; // SSR duman testi/route'suz render için düşme değeri
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();

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
    if (!user) { requireAuth(`@${handle}'ı takip etmek için giriş yap.`); return; }
    if (!profile || isOwner || followBusy) return;
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

  // AK-080 C2/C4: profil detay sayfası login duvarının arkasında — liderlik tablosundaki rütbe/
  // t-stat özetleri (Topluluk.jsx) zaten girişsiz görünür kalır, buradaki DETAY (strateji listesi,
  // takip et) merak kancası olarak login'e bağlanır. Sayfa yönlendirmesi yok, inline nudge.
  if (!user) {
    return (
      <div className="ak-prof">
        <div className="ak-prof-locked">
          <div className="ak-prof-av">{handle[0].toUpperCase()}</div>
          <Lock size={20} />
          <h2>@{handle} profilini görmek için giriş yap</h2>
          <p>Doğrulanmış stratejiler, t-stat detayları ve takip özelliği girişli kullanıcılara açık.</p>
          <button className="ak-btn ak-btn-primary" onClick={() => requireAuth(`@${handle} profilini görmek için giriş yap.`)}>
            Giriş yap
          </button>
        </div>
      </div>
    );
  }

  // C2 (2): doğrulanmış istatistik bloğu — yalnız Supabase'teki public strategies'ten (n = toplam strateji sayısı)
  const bestT = strategies.length ? Math.max(...strategies.map(s => Number(s.oos_t) || 0)) : 0;
  const verifiedCount = strategies.filter(s => Number(s.oos_t) >= 2).length;

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
            disabled={followBusy}
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

      {isOwner && tab === "portfoy" && <PortfolioPanel />}
    </div>
  );
}
