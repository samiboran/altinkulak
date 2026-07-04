// Ogren sayfasina gomulen kucuk lab — ders baglamiyla on-dolu.
import { useState } from "react";
import { Play, ShieldCheck, ShieldAlert } from "lucide-react";
import { getBars } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";

export default function LabEmbed({ symbol = "SOL", rr = 2 }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  function run() {
    setBusy(true);
    setTimeout(() => { setRes(runBacktest(getBars(symbol), { rr, maxGapATR: 0.6 })); setBusy(false); }, 120);
  }
  return (
    <div className="ak-embed">
      <div className="ak-embed-ctx">Ders verisi: <b>{symbol}</b> · FVG · 1:{rr}</div>
      {!res && <p className="ak-embed-hint">Videodaki FVG kurulumunu kendi verinde test et.</p>}
      {res && (
        <>
          <div className="ak-embed-metrics">
            <span>{res.winRate}% kazanç</span><span>{res.oosTrades} OOS</span><span>t = {res.tStat}</span>
          </div>
          <div className={"ak-embed-verdict " + (res.verdict.good ? "good" : "bad")}>
            {res.verdict.good ? <ShieldCheck size={14}/> : <ShieldAlert size={14}/>}
            {res.verdict.good ? "Anlamlı edge" : "Edge yok"} — kontrol t = {res.controlP95}
          </div>
        </>
      )}
      <button className="ak-btn ak-btn-primary" style={{marginTop:12,width:"100%",justifyContent:"center"}} onClick={run} disabled={busy}>
        <Play size={15}/> {busy ? "Çalışıyor…" : res ? "Tekrar çalıştır" : "Bu dersi test et"}
      </button>
    </div>
  );
}
