import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { fetchFollowList } from "../lib/profileStats.js";
import "../styles/identity.css";

// AK-086 K1: kimlik kartı istatistik şeridi (TradingView modeli) — Profil.jsx header'ı VE
// Ben.jsx üst kartı arasında paylaşılan tek bileşen (D7: sosyal sayılar küçük, istatistik
// metrikleri büyük — bu yüzden burada büyük .ak-ps/.ak-ben-stat DEĞİL, küçük bir şerit).
// Fikirler sayaç değil, liste yok — yalnız Takipçi/Takip Edilen tıklanınca liste modalı açılır.
export default function IdentityStats({ profileId, ideas, followers, following }) {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const [listType, setListType] = useState(null); // null | "followers" | "following"

  function openList(type, label) {
    if (!user) { requireAuth(`${label} listesini görmek için giriş yap.`); return; }
    setListType(type);
  }

  return (
    <>
      <div className="ak-idstats">
        <span className="ak-idstat"><b>{ideas}</b> Fikir</span>
        <button className="ak-idstat" onClick={() => openList("followers", "Takipçi")}><b>{followers}</b> Takipçi</button>
        <button className="ak-idstat" onClick={() => openList("following", "Takip Edilen")}><b>{following}</b> Takip Edilen</button>
      </div>
      {listType && (
        <FollowListPanel profileId={profileId} type={listType} onClose={() => setListType(null)} />
      )}
    </>
  );
}

function FollowListPanel({ profileId, type, onClose }) {
  const [rows, setRows] = useState(null); // null = yükleniyor

  useEffect(() => {
    let on = true;
    setRows(null);
    fetchFollowList(profileId, type).then((r) => { if (on) setRows(r); });
    return () => { on = false; };
  }, [profileId, type]);

  return (
    <div className="ak-modal-veil" onClick={onClose}>
      <div className="ak-modal ak-idlist" onClick={(e) => e.stopPropagation()}>
        <div className="ak-idlist-head">
          <h3>{type === "followers" ? "Takipçiler" : "Takip Edilenler"}</h3>
          <button className="ak-icon" onClick={onClose}><X size={16} /></button>
        </div>
        {rows === null ? (
          <p className="ak-hint">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="ak-hint">{type === "followers" ? "Henüz takipçisi yok." : "Henüz kimseyi takip etmiyor."}</p>
        ) : (
          <div className="ak-idlist-rows">
            {rows.map((h) => (
              <Link key={h} to={`/u/${h}`} className="ak-idlist-row" onClick={onClose}>@{h}</Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
