import { useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import SistemimKoduPanel, { loadSavedSymbol } from "../components/SistemimKoduPanel.jsx";
import "../styles/kodeditoru.css";

export default function KodEditoru() {
  const [symbol, setSymbol] = useState(() => loadSavedSymbol());

  return (
    <div className="ak-kod">
      <span className="ak-eyebrow">KOD EDİTÖRÜM <span className="ak-soon">deneysel</span></span>
      <h1>Kendi sinyal kuralını yaz.</h1>
      <p className="ak-kod-lead">
        Hazır yapı taşlarıyla (<code>ema</code>, <code>atr</code>, <code>rsi</code>, <code>findFib</code>, <code>fibSideOk</code>) kendi <code>mySignal(bars, helpers)</code> fonksiyonunu yaz, "Çalıştır"a bas, sonucu gör.
        Kod SADECE bu tarayıcıda, izole bir sandbox'ta (iframe) çalışır — sunucuya gönderilmez, hiçbir başka kullanıcı görmez.
      </p>
      <p className="ak-kod-lablink">
        <FlaskConical size={13} /> Bunu grafikle (giriş/stop/hedef çizgileri, kazanan/kaybeden renkleri, win rate/t-stat) birlikte görmek için <Link to="/lab">Lab sayfasını</Link> kullan.
      </p>

      <SistemimKoduPanel
        symbol={symbol}
        onSymbolChange={setSymbol}
        showSymbolPicker={true}
        showResultsList={true}
      />
    </div>
  );
}
