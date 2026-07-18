import { useState, useEffect, useMemo } from "react";
import { Search, ShieldCheck, ShieldAlert, Wand2, X } from "lucide-react";
import { AVAILABLE_BLOCKS, generateSignalCode } from "../lib/codegen.js";
import { analyzeRange } from "../lib/strategyExtractor.js";

// AK-087: C2 (oluşum paneli) + C3 (kural kurucu) + C4 (kodu üret). Görsel/etkileşim burada;
// tespit mantığı strategyExtractor.js'te (test edilir), kod üretimi codegen.js'te (dokunulmadı).
// props: bars, range({start,end} bar index) — null ise "seç" boş durumu. onGenerateCode(code).
export default function StrategyExtractor({ bars, range, onGenerateCode, onClose }) {
  const [selected, setSelected] = useState([]); // AVAILABLE_BLOCKS anahtarları
  const [slR, setSlR] = useState(2);
  const [tpR, setTpR] = useState(5);

  const { cards, blockKeysFound } = useMemo(
    () => (bars && range ? analyzeRange(bars, range.start, range.end) : { cards: [], blockKeysFound: [] }),
    [bars, range]
  );

  // Yeni bir aralık seçilince: o aralıkta gerçekten bulunan blokları varsayılan işaretli getir —
  // kullanıcı dilerse kaldırır/ekler (D6: bulunmayan bir şey ASLA otomatik işaretlenmez).
  useEffect(() => { setSelected(blockKeysFound); }, [range?.start, range?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleBlock(key) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  function handleGenerate() {
    const code = generateSignalCode(selected, { slR: Number(slR) || 2, tpR: Number(tpR) || 5 });
    if (code) onGenerateCode(code);
  }

  if (!range) {
    return (
      <div className="ak-se-empty">
        <Search size={22} />
        <p>Grafikte "İncele" aracıyla bir bölge seç — o aralıktaki oluşumlar burada listelenir.</p>
      </div>
    );
  }

  return (
    <div className="ak-se">
      <div className="ak-se-head">
        <span>Seçili aralık: bar #{range.start}–#{range.end} ({range.end - range.start + 1} bar)</span>
        {onClose && <button className="ak-se-x" onClick={onClose} title="Seçimi kapat"><X size={14} /></button>}
      </div>

      <div className="ak-se-cards">
        {cards.length === 0 ? (
          // D6: hiçbir şey bulunamazsa dürüst boş durum — asla uydurma eşleşme.
          <p className="ak-se-nohit">Bu aralıkta bilinen oluşum tespit edilmedi.</p>
        ) : (
          cards.map((c) => (
            <div className={"ak-se-card" + (c.blockKey ? "" : " info")} key={c.type}>
              <span className="nm">{c.label}</span>
              <span className="ct">{c.count} adet</span>
              {!c.blockKey && <span className="ak-soon">bilgi amaçlı</span>}
            </div>
          ))
        )}
      </div>

      <div className="ak-se-builder">
        <span className="ak-se-sub">Kural kurucu — hangi yapı taşları VE ile bağlansın?</span>
        <div className="ak-se-blocks">
          {AVAILABLE_BLOCKS.map((b) => (
            <label key={b.key} className={selected.includes(b.key) ? "on" : ""}>
              <input type="checkbox" checked={selected.includes(b.key)} onChange={() => toggleBlock(b.key)} />
              {b.label}
              {blockKeysFound.includes(b.key) && <span className="ak-se-found" title="Bu aralıkta bulundu">●</span>}
            </label>
          ))}
        </div>
        <div className="ak-se-risk">
          <label>Stop (×ATR/2)<input type="number" min="0.5" step="0.5" value={slR} onChange={(e) => setSlR(e.target.value)} /></label>
          <label>Hedef (R)<input type="number" min="0.5" step="0.5" value={tpR} onChange={(e) => setTpR(e.target.value)} /></label>
        </div>
        <button className="ak-btn ak-btn-primary" onClick={handleGenerate} disabled={!selected.length}>
          <Wand2 size={15} /> Kodu üret
        </button>
        {!selected.length && <p className="ak-se-note">En az bir yapı taşı seç.</p>}
      </div>
    </div>
  );
}
