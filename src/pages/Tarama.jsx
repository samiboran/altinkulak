import { useState } from "react";
import { Radar, ShieldCheck, ShieldAlert, Play, Monitor, AlertTriangle } from "lucide-react";
import { getBars, ALL_SYMBOLS, loadReal, isReal, REAL_CAPABLE } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";
import { bonferroniT, expectedFalsePositives } from "../lib/stats.js";
import "../styles/tarama.css";

const CONCEPTS = [["fvg", "FVG"], ["ob", "Order Block"], ["bos", "BOS"], ["of", "Order Flow"], ["fib", "Fibonacci"]];
const N = ALL_SYMBOLS.length;
const STRICT_T = bonferroniT(N);           // örn. 15 test → t ≥ 2.7
const EFP = expectedFalsePositives(N);     // örn. ~0.8 sahte pozitif beklenir

export default function Tarama() {
  const [concepts, setConcepts] = useState(["fvg"]);
  const [rr, setRr] = useState(2);
  const [strict, setStrict] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    // AK-004b: gerçek kaynağı olan semboller önce yüklenir (önbellekteyse anında)
    await Promise.all(REAL_CAPABLE.map((s) => loadReal(s).catch(() => null)));
    const out = ALL_SYMBOLS.map(({ sym, name, group }) => {
      const r = runBacktest(getBars(sym), { rr: Number(rr) || 2, maxGapATR: 0.6, concepts, costR: 0.05 });
      return { sym, name, group, real: isReal(sym), t: r.tStat, win: r.winRate, exp: r.expectancy, oos: r.oosTrades, good: r.verdict.good };
    }).sort((a, b) => b.t - a.t);
    setRows(out); setBusy(false);
  }

  function toggle(k) { setConcepts(c => c.includes(k) ? c.filter(z => z !== k) : [...c, k]); setRows(null); }

  // Sıkı mod: aynı sonuçlar, daha yüksek eşikle yeniden yargılanır (yeniden tarama gerekmez)
  const judged = rows ? rows.map(r => ({ ...r, pass: strict ? (r.good && r.t >= STRICT_T) : r.good })) : null;
  const edgeCount = judged ? judged.filter(r => r.pass).length : 0;

  return (
    <div className="ak-tar">
      <span className="ak-eyebrow">EDGE TARAYICI</span>
      <h1>Şu an hangi piyasada edge var?</h1>
      <p className="ak-tar-lead">Seçtiğin taktiği tüm sembollerde aynı anda, geçmiş verinin son 900 barında test eder ve out-of-sample t-istatistiğine göre sıralar. Geçmişte nerede istatistiksel kenar vardı — tahmin değil, ölçüm; gelecek vaadi değildir.</p>
      <span className="ak-deskonly"><Monitor size={13} /> Tam tarama masaüstünde; telefonda ilk birkaç sonuç.</span>

      <div className="ak-tar-ctrl">
        <div className="ak-tar-chips">
          {CONCEPTS.map(([k, l]) => <button key={k} className={"ak-cchip" + (concepts.includes(k) ? " on" : "")} onClick={() => toggle(k)}>{l}</button>)}
        </div>
        <div className="ak-tar-rr">R:R 1 : <input type="number" min="1" step="0.5" value={rr} onChange={e => { setRr(e.target.value); setRows(null); }} /></div>
        <button className={"ak-cchip teal" + (strict ? " on" : "")} onClick={() => setStrict(s => !s)} title={`Bonferroni: t ≥ ${STRICT_T}`}>Sıkı mod</button>
        <button className="ak-btn ak-btn-primary" onClick={scan} disabled={busy}><Play size={15} /> {busy ? "Taranıyor…" : "Tara"}</button>
      </div>

      {judged && (
        <>
          <div className="ak-tar-honest">
            <AlertTriangle size={14} />
            <p>
              <b>Çoklu-test uyarısı:</b> {N} sembol aynı anda tarandı. Hiçbir yerde gerçek edge olmasa bile, t ≥ 2 eşiğini şans eseri ~{EFP} sembolün geçmesi beklenir. Tek taramadaki tek "edge"e güvenme.{" "}
              {strict
                ? <>Sıkı mod açık: eşik Bonferroni ile <b>t ≥ {STRICT_T}</b>'ye yükseltildi.</>
                : <>Bunu düzeltmek için <b>Sıkı mod</b>u aç (eşik t ≥ {STRICT_T} olur).</>}
              {" "}Sonuç: <b>{edgeCount}</b> sembol {strict ? "sıkı" : "standart"} eşiği geçti.
            </p>
          </div>
          <div className="ak-tar-table">
            <div className="ak-tar-h"><span>#</span><span>Sembol</span><span>Piyasa</span><span>OOS</span><span>Kazanç</span><span>Beklenen</span><span>t-stat</span><span>Sonuç</span></div>
            {judged.map((r, i) => (
              <div className={"ak-tar-r" + (r.pass ? " good" : "")} key={r.sym}>
                <span className="rk">{i + 1}</span>
                <span className="sy">{r.sym} <i className={"src" + (r.real ? " real" : "")} title={r.real ? "Gerçek veri (Binance 4H)" : "Örnek veri"}>{r.real ? "●" : "○"}</i><em>{r.name}</em></span>
                <span className="gr">{r.group}</span>
                <span className="mono">{r.oos}</span>
                <span className="mono">{r.win}%</span>
                <span className={"mono " + (r.exp > 0 ? "pos" : "neg")}>{r.exp > 0 ? "+" : ""}{r.exp}R</span>
                <span className={"mono t " + (r.pass ? "pos" : "neg")}>{r.t}</span>
                <span className="vd">{r.pass ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}</span>
              </div>
            ))}
          </div>
          <p className="ak-tar-note">Tüm sonuçlara işlem başına 0.05R maliyet (komisyon + slippage) dahildir; rastgele kontrol grubu da aynı maliyeti öder. ● = gerçek veri (Binance 4H, son 900 bar) · ○ = örnek veri (BIST/ABD lisanslı kaynak beklemede). Sonuçlar geçmişe aittir; yatırım tavsiyesi değildir.</p>
        </>
      )}
      {!judged && <div className="ak-tar-empty"><Radar size={26} /><p>Taktiğini seç, "Tara"ya bas. Tüm semboller aynı dürüstlük testinden geçer.</p></div>}
    </div>
  );
}
