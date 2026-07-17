import { useState } from "react";
import { Award } from "lucide-react";
import "../styles/badges.css";

// AK-086 K3: rozet vitrini — badges.js/visibleBadges'in ürettiği listeyi (gizli+kazanılmamış
// rozetler zaten filtrelenmiş) görsel şeride çevirir. Kazanılan renkli, kazanılmamış (secret:false
// ama henüz alınmamış) soluk. Tıklayınca/hover'da tooltip: başlık + açıklama.
export default function BadgeStrip({ badges }) {
  const [openKey, setOpenKey] = useState(null);
  if (!badges || badges.length === 0) return null;

  return (
    <div className="ak-badges">
      {badges.map((b) => (
        <div className="ak-badge-wrap" key={b.key}>
          <button
            className={"ak-badge-chip" + (b.earned ? " earned" : "")}
            onClick={() => setOpenKey((k) => (k === b.key ? null : b.key))}
            title={b.title}
          >
            <Award size={14} />
          </button>
          {openKey === b.key && (
            <div className="ak-badge-tip">
              <b>{b.title}</b>
              <p>{b.desc}</p>
              {!b.earned && <span className="ak-badge-tip-locked">Henüz kazanılmadı</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
