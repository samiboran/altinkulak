import { useState } from "react";
import { Eye, EyeOff, Settings, Trash2 } from "lucide-react";

// AK-068: TradingView tarzı gösterge legend'ı — sol üstte her aktif gösterge bir satır,
// hover'da göz(gizle-göster)/dişli(ayar)/çöp(sil) ikonları belirir. Onay penceresi YOK;
// silme anında olur, tek adımlık "geri al" kısa süreliğine altta görünür (bkz. Lab.jsx).
export default function ChartLegend({
  indicators = [],
  onToggleShown,
  onRemove,
  onSetParam,
  lastRemoved = null,
  onUndoRemove,
}) {
  const [openGear, setOpenGear] = useState(null); // ayar popover'ı açık olan gösterge id'si
  const [gearVal, setGearVal] = useState("");

  if (!indicators.length && !lastRemoved) return null;

  function toggleGear(ind) {
    if (ind.type === "concept") return; // ayarlanabilir parametresi yok
    setOpenGear((id) => (id === ind.id ? null : ind.id));
    setGearVal(String(ind.params.period ?? ""));
  }
  function applyGear(id) {
    const n = parseInt(gearVal, 10);
    if (Number.isFinite(n) && n > 1) onSetParam?.(id, { period: n });
    setOpenGear(null);
  }

  return (
    <div className="ak-legend">
      {indicators.map((ind) => (
        <div className={"ak-legend-row" + (ind.shown ? "" : " off")} key={ind.id}>
          {ind.type === "ma" && <i className="ak-legend-dot" style={{ background: ind.params.color }} />}
          <span className="ak-legend-label">{ind.label}{ind.showPeriodInLabel && ind.params.period ? ` ${ind.params.period}` : ""}</span>
          <span className="ak-legend-icons">
            <button title={ind.shown ? "Gizle" : "Göster"} onClick={() => onToggleShown?.(ind.id)}>
              {ind.shown ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              title={ind.type === "concept" ? "Bu göstergenin ayarı yok" : "Ayarlar"}
              disabled={ind.type === "concept"}
              onClick={() => toggleGear(ind)}
            >
              <Settings size={12} />
            </button>
            <button title="Kaldır" onClick={() => onRemove?.(ind.id)}><Trash2 size={12} /></button>
          </span>
          {openGear === ind.id && (
            <div className="ak-legend-gear" onClick={(e) => e.stopPropagation()}>
              <span>Periyot</span>
              <input type="number" min="2" max="500" value={gearVal} onChange={(e) => setGearVal(e.target.value)} />
              <button onClick={() => applyGear(ind.id)}>Uygula</button>
            </div>
          )}
        </div>
      ))}
      {lastRemoved && (
        <button className="ak-legend-undo" onClick={onUndoRemove}>{lastRemoved.label} kaldırıldı — Geri Al</button>
      )}
    </div>
  );
}
