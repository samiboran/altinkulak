import { useState, useEffect, useMemo, useRef } from "react";
import { FlaskConical, Activity, Play, Pause, SkipBack, SkipForward, RotateCcw, ShieldCheck, ShieldAlert, Search, SlidersHorizontal, Monitor, Dices, Calculator } from "lucide-react";
import { getBars, MARKET_GROUPS, ALL_SYMBOLS, loadReal, isReal } from "../lib/data.js";
import Chart from "../components/Chart.jsx";
import Timeline from "../components/Timeline.jsx";
import { runBacktest } from "../lib/backtest.js";
import "../styles/lab.css";
import "../styles/chart.css";

const CONCEPTS = [["fvg","FVG"],["ob","Order Block"],["bos","BOS"],["mit","Mitigation"],["of","Order Flow"],["fib","Fibonacci"]];

function Equity({ curve }) {
  if (!curve || curve.length < 2) return null;
  const w = 280, h = 60, min = Math.min(0, ...curve), max = Math.max(0, ...curve), range = max - min || 1;
  const pts = curve.map((v, i) => `${((i / (curve.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
  const zeroY = h - ((0 - min) / range) * h;
  return (
    <svg className="ak-eq" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} className="ak-eq-zero" />
      <polyline points={pts} className="ak-eq-line" />
    </svg>
  );
}

export default function Lab() {
  const [group, setGroup] = useState("kripto");
  const [query, setQuery] = useState("SOL");
  const [debounced, setDebounced] = useState("SOL");
  const [symbol, setSymbol] = useState("SOL");
  const [open, setOpen] = useState(false);
  const [rr, setRr] = useState(2);
  const [gap, setGap] = useState(0.6);   // gelişmiş: FVG boşluk eşiği (×ATR)
  const [cost, setCost] = useState(0.05); // gelişmiş: işlem maliyeti (R) — komisyon+slippage
  const [adv, setAdv] = useState(false);
  const [concepts, setConcepts] = useState(["fvg"]);
  const [showEma, setShowEma] = useState(true);
  const [win, setWin] = useState({ s: 0.84, e: 1 });
  const [lanes, setLanes] = useState(["liq"]);
  const [lanesOn, setLanesOn] = useState(true);
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(280);
  const [risk, setRisk] = useState(false);
  const [rAcc, setRAcc] = useState(1000);
  const [rPct, setRPct] = useState(1);
  const [rEntry, setREntry] = useState(100);
  const [rStop, setRStop] = useState(98);

  const _bars = getBars(symbol);
  const _N = _bars.length;
  const winStart = Math.floor(win.s * _N);
  const winEnd = Math.max(winStart + 12, Math.ceil(win.e * _N) - 1);
  const chartRange = replay
    ? { start: winStart, end: Math.min(Math.max(cursor, winStart + 4), winEnd) }
    : { start: winStart, end: winEnd };

  useEffect(() => {
    if (!replay || !playing) return;
    const id = setInterval(() => {
      setCursor(c => { if (c >= winEnd) { setPlaying(false); return c; } return c + 1; });
    }, speed);
    return () => clearInterval(id);
  }, [replay, playing, speed, winEnd]);

  function toggleReplay() {
    const ns = !replay;
    setReplay(ns);
    if (ns) { setCursor(winStart + Math.min(30, Math.floor((winEnd - winStart) / 3))); setPlaying(false); }
    else setPlaying(false);
  }
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setDataV] = useState(0); // gerçek veri gelince yeniden çizim tetikler
  const boxRef = useRef(null);

  // AK-004b: kripto sembollerinde gerçek Binance verisini arka planda yükle
  useEffect(() => {
    let on = true;
    loadReal(symbol).then((b) => { if (on && b) { setRes(null); setDataV(v => v + 1); } });
    return () => { on = false; };
  }, [symbol]);

  // akıllı tamamlama: yazdıktan ~1.5sn sonra öneriler
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300); // standart ~300ms
    return () => clearTimeout(id);
  }, [query]);

  const suggestions = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return ALL_SYMBOLS.slice(0, 6);
    return ALL_SYMBOLS.filter((s) => s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [debounced]);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s) { setSymbol(s.sym); setQuery(s.sym); setDebounced(s.sym); setOpen(false); setRes(null); }

  function run() {
    setBusy(true);
    setTimeout(() => { setRes(runBacktest(getBars(symbol), { rr: Number(rr) || 2, maxGapATR: Number(gap) || 0.6, concepts, costR: Number(cost) || 0 })); setBusy(false); }, 120);
  }

  return (
    <div className="ak-lab">
      <div className="ak-lab-head">
        <span className="ak-eyebrow">STRATEJİ LABORATUVARI</span>
        <h1>Kur, test et — istatistik yalan söylemez.</h1>
        <p className="ak-lab-lead">
          Lookahead-bias engelli, 70/30 train/test, rastgele giriş kontrol grubuyla. Sonuç sadece kazanç eğrisi değil; out-of-sample t-istatistiğiyle <b>ne kadar güvenilir</b> onu da söyler.
        </p>
        <span className="ak-deskonly"><Monitor size={13} /> Tam strateji kurulumu masaüstü içindir. Telefonda izleme + hızlı test sunulur.</span>
      </div>

      <div className="ak-chartwrap">
        <div className="ak-cfilter">
          <span className="ak-cflab">Otomatik işaretle:</span>
          {CONCEPTS.map(([k,l]) => (
            <button key={k} className={"ak-cchip" + (concepts.includes(k) ? " on" : "")}
              onClick={() => setConcepts(c => c.includes(k) ? c.filter(z=>z!==k) : [...c,k])}>{l}</button>
          ))}
          <button className={"ak-cchip teal" + (showEma ? " on" : "")} onClick={() => setShowEma(v=>!v)}>EMA 20</button>
          <button className={"ak-cchip teal" + (lanesOn ? " on" : "")} onClick={() => setLanesOn(v=>!v)}>Katmanlar</button>
          <button className={"ak-cchip teal" + (replay ? " on" : "")} onClick={toggleReplay}>Replay</button>
          <span className={"ak-datasrc" + (isReal(symbol) ? " real" : "")}>
            {isReal(symbol) ? "● GERÇEK VERİ · Binance 4H" : "○ örnek veri"}
          </span>
        </div>
        <Chart bars={getBars(symbol)} concepts={concepts} showEma={showEma} trades={replay ? null : res?.trades} range={chartRange} />
        {replay && (
          <div className="ak-replay">
            <button className="ak-rp" onClick={() => setCursor(c => Math.max(winStart + 4, c - 1))} title="Geri"><SkipBack size={15} /></button>
            <button className="ak-rp play" onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="ak-rp" onClick={() => setCursor(c => Math.min(winEnd, c + 1))} title="İleri"><SkipForward size={15} /></button>
            <div className="ak-rp-prog"><div style={{ width: `${((cursor - winStart) / Math.max(1, winEnd - winStart)) * 100}%` }} /></div>
            <div className="ak-rp-speed">{[[1, 280], [2, 140], [4, 70]].map(([x, ms]) => <button key={x} className={speed === ms ? "on" : ""} onClick={() => setSpeed(ms)}>{x}x</button>)}</div>
            <button className="ak-rp txt" onClick={() => { setCursor(winStart + Math.min(30, Math.floor((winEnd - winStart) / 3))); setPlaying(false); }}><RotateCcw size={13} /> Sıfırla</button>
          </div>
        )}
        <Timeline bars={getBars(symbol)} win={win} onChange={setWin}
          lanes={lanes} lanesOn={lanesOn}
          onToggleLane={(k) => setLanes(l => l.includes(k) ? l.filter(z => z !== k) : [...l, k])} />
      </div>

      <div className="ak-lab-grid">
        <div className="ak-panel">
          <h2><FlaskConical size={17} /> Strateji</h2>

          <div className="ak-row"><label>Piyasa</label>
            <div className="ak-pill">{MARKET_GROUPS.map((g) =>
              <button key={g.key} className={group === g.key ? "on" : ""}
                onClick={() => { setGroup(g.key); pick({ sym: g.symbols[0] }); }}>{g.label}</button>)}
            </div>
          </div>

          {/* Sembol: arama + akıllı tamamlama */}
          <div className="ak-row ak-row-top"><label>Sembol</label>
            <div className="ak-search" ref={boxRef}>
              <div className="ak-search-in">
                <Search size={15} />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)} placeholder="Sembol ara (örn. SOL, ASELS, NVDA)" spellCheck={false} />
              </div>
              {open && suggestions.length > 0 && (
                <div className="ak-sug">
                  {suggestions.map((s) => (
                    <button key={s.sym} onClick={() => pick(s)}>
                      <b>{s.sym}</b><span>{s.name}</span><em>{s.group}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="ak-active-sym">Seçili: <b>{symbol}</b></div>

          {/* Risk:Ödül serbest giriş */}
          <div className="ak-row"><label>Risk : Ödül</label>
            <div className="ak-rr">1 : <input type="number" min="1" step="0.5" value={rr} onChange={(e) => { setRr(e.target.value); setRes(null); }} /></div>
          </div>

          {/* Gelişmiş: kendi sistemini uzat */}
          <button className="ak-adv-toggle" onClick={() => setAdv((v) => !v)}>
            <SlidersHorizontal size={14} /> Kendi sistemin (gelişmiş) {adv ? "▲" : "▼"}
          </button>
          {adv && (
            <div className="ak-adv">
              <div className="ak-row"><label>FVG boşluk eşiği (×ATR)</label>
                <div className="ak-rr"><input type="number" min="0.2" max="1.2" step="0.1" value={gap} onChange={(e) => { setGap(e.target.value); setRes(null); }} /></div>
              </div>
              <div className="ak-row"><label>İşlem maliyeti (R)</label>
                <div className="ak-rr"><input type="number" min="0" max="0.5" step="0.01" value={cost} onChange={(e) => { setCost(e.target.value); setRes(null); }} /></div>
              </div>
              <p className="ak-note">Dar boşluk = daha seçici. Araştırmamız edge’in dar + trend yönlü boşlukta yaşadığını gösterdi. İşlem maliyeti (komisyon + slippage) her işlemden düşülür — rastgele kontrol grubu da aynı maliyeti öder; 0.05 = riskin %5'i. Maliyetsiz backtest kendini kandırmaktır.</p>
            </div>
          )}

          <button className="ak-btn ak-btn-primary ak-run" onClick={run} disabled={busy}>
            <Play size={16} /> {busy ? "Çalışıyor…" : "Backtest çalıştır"}
          </button>

          <button className="ak-adv-toggle" onClick={() => setRisk(v => !v)}>
            <Calculator size={14} /> Pozisyon & risk hesaplayıcı {risk ? "▲" : "▼"}
          </button>
          {risk && (() => {
            const acc = Number(rAcc) || 0, rp = Number(rPct) || 0, en = Number(rEntry) || 0, st = Number(rStop) || 0;
            const perUnit = Math.abs(en - st);
            const riskAmt = acc * rp / 100;
            const size = perUnit > 0 ? riskAmt / perUnit : 0;
            const posVal = size * en;
            const expVal = res ? res.expectancy * riskAmt : null;
            return (
              <div className="ak-adv ak-risk">
                <div className="ak-risk-in">
                  <label>Hesap ($)<input type="number" value={rAcc} onChange={e => setRAcc(e.target.value)} /></label>
                  <label>Risk %<input type="number" step="0.5" value={rPct} onChange={e => setRPct(e.target.value)} /></label>
                  <label>Giriş<input type="number" value={rEntry} onChange={e => setREntry(e.target.value)} /></label>
                  <label>Stop<input type="number" value={rStop} onChange={e => setRStop(e.target.value)} /></label>
                </div>
                <div className="ak-risk-out">
                  <div><b>{size ? size.toFixed(4) : "—"}</b><span>pozisyon (adet)</span></div>
                  <div><b>${riskAmt.toFixed(0)}</b><span>riske attığın (1R)</span></div>
                  <div><b>${posVal ? posVal.toFixed(0) : "—"}</b><span>pozisyon değeri</span></div>
                </div>
                {expVal !== null && <p className="ak-note">Bu sembolün beklenen değeriyle (×{res.expectancy}R/işlem) işlem başına teorik beklenti: <b style={{ color: expVal >= 0 ? "var(--good)" : "var(--bad)" }}>{expVal >= 0 ? "+" : ""}${expVal.toFixed(1)}</b>. Geçmiş ≠ gelecek; risk yönetimi şart.</p>}
              </div>
            );
          })()}
        </div>

        <div className="ak-panel">
          <h2><Activity size={17} /> Sonuç {res && <span className="ak-res-ctx">{symbol} · 1:{rr}</span>}</h2>
          {!res && <p className="ak-hint">Sembolü ara, parametreni ayarla, “Backtest çalıştır”a bas. İpucu: <b>SOL</b> ile <b>RND</b>’yi karşılaştır.</p>}
          {res && (
            <>
              <div className="ak-metrics">
                <div className="ak-metric"><div className="v">{res.winRate}%</div><div className="k">Kazanç oranı</div></div>
                <div className="ak-metric"><div className="v">{res.oosTrades}</div><div className="k">OOS işlem</div></div>
                <div className="ak-metric"><div className="v">{res.maxDD}R</div><div className="k">Max drawdown</div></div>
                <div className="ak-metric"><div className={"v " + (res.expectancy > 0 ? "ok" : "no")}>{res.expectancy > 0 ? "+" : ""}{res.expectancy}R</div><div className="k">Beklenen değer</div></div>
                <div className="ak-metric"><div className="v">{res.profitFactor}</div><div className="k">Profit factor</div></div>
              </div>
              <Equity curve={res.curve} />
              <div className={"ak-verdict " + (res.verdict.good ? "good" : "bad")}>
                <div className="vt">{res.verdict.good ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                  {res.verdict.good ? `Anlamlı edge — t = ${res.tStat}` : `Edge yok — t = ${res.tStat}`}</div>
                <div className="vd">{res.verdict.reason} Rastgele giriş kontrol %95 eşiği: t = {res.controlP95}.{res.verdict.good && " Yine de canlı forward test şart."}</div>
              </div>
              {res.mc && (
                <div className="ak-mc">
                  <div className="ak-mc-head"><Dices size={14} /> İleri simülasyon (1000× karıştırma) — tek eğriye güvenme</div>
                  <div className="ak-mc-grid">
                    <div><span className="ak-mc-v">{res.mc.medianR > 0 ? "+" : ""}{res.mc.medianR}R</span><span className="ak-mc-k">medyan sonuç</span></div>
                    <div><span className={"ak-mc-v " + (res.mc.p05R < 0 ? "no" : "")}>{res.mc.p05R > 0 ? "+" : ""}{res.mc.p05R}R</span><span className="ak-mc-k">kötü %5 senaryo</span></div>
                    <div><span className="ak-mc-v">{res.mc.worstDD}R</span><span className="ak-mc-k">en kötü drawdown</span></div>
                    <div><span className={"ak-mc-v " + (res.mc.negPct > 0 ? "no" : "ok")}>%{res.mc.negPct}</span><span className="ak-mc-k">zararla biten</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
