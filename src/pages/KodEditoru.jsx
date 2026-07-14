import { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { Play, AlertTriangle, RotateCcw } from "lucide-react";
import { getBars, hasData, ALL_SYMBOLS } from "../lib/data.js";
import { runUserCode } from "../lib/sandboxRunner.js";
import "../styles/kodeditoru.css";
import "../styles/izleme.css"; // AK-065: sonuç listesi Izleme'deki sinyal satırı stiliyle aynı

const LSKEY = "ak_user_scripts_v1";

const TEMPLATE = `// Kendi sinyal kuralın — bars: {o,h,l,c,t,time?,v?} dizisi (eskiden yeniye sıralı)
// helpers: ema(bars,period), atr(bars,period), rsi(bars,period), findFib(bars,lookback), fibSideOk(price,fib,dir)
// Bu kod SADECE bu tarayıcıda, izole bir alanda çalışır — sunucuya gönderilmez, kimseyle paylaşılmaz.
function mySignal(bars, helpers) {
  const { ema, rsi } = helpers;
  const e50 = ema(bars, 50);
  const r = rsi(bars, 14);
  const out = [];
  for (let i = 60; i < bars.length; i++) {
    const b = bars[i];
    if (e50[i] == null || r[i] == null) continue;
    if (b.c > e50[i] && r[i] < 35) {
      out.push({ i, dir: 1, entry: b.c, stop: b.c * 0.98, hedef1: b.c * 1.02, hedef2: b.c * 1.04 });
    } else if (b.c < e50[i] && r[i] > 65) {
      out.push({ i, dir: -1, entry: b.c, stop: b.c * 1.02, hedef1: b.c * 0.98, hedef2: b.c * 0.96 });
    }
  }
  return out;
}
`;

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(LSKEY));
    if (saved && typeof saved === "object" && typeof saved.code === "string") return saved;
  } catch { /* bozuk kayıt — şablona düş */ }
  return { code: TEMPLATE, symbol: "SOL" };
}

function fmtP(p) {
  if (!Number.isFinite(p)) return "";
  const a = Math.abs(p);
  if (a >= 10000) return Math.round(p).toLocaleString("en-US");
  if (a >= 1000) return p.toFixed(0);
  if (a >= 100) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

export default function KodEditoru() {
  const [code, setCode] = useState(() => loadSaved().code);
  const [symbol, setSymbol] = useState(() => loadSaved().symbol);
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState(null); // {ok, result, error, ms}
  const runToken = useRef(0); // AK-065: eskimiş (üst üste tıklanmış) çalıştırmaların sonucu yok sayılır

  useEffect(() => {
    try { localStorage.setItem(LSKEY, JSON.stringify({ code, symbol })); } catch { /* kotayı aşarsa sessiz geç */ }
  }, [code, symbol]);

  async function run() {
    if (!hasData(symbol)) { setOut({ ok: false, error: `${symbol} için veri yok.` }); return; }
    const bars = getBars(symbol);
    const token = ++runToken.current;
    setRunning(true);
    setOut(null);
    const t0 = performance.now();
    const res = await runUserCode(code, bars);
    if (token !== runToken.current) return; // bu arada yeni bir çalıştırma başlamış — atla
    setRunning(false);
    setOut({ ...res, ms: Math.round(performance.now() - t0) });
  }

  function resetTemplate() {
    if (running) return;
    setCode(TEMPLATE);
    setOut(null);
  }

  const results = Array.isArray(out?.result) ? out.result : null;

  return (
    <div className="ak-kod">
      <span className="ak-eyebrow">KOD EDİTÖRÜM <span className="ak-soon">deneysel</span></span>
      <h1>Kendi sinyal kuralını yaz.</h1>
      <p className="ak-kod-lead">
        Hazır yapı taşlarıyla (<code>ema</code>, <code>atr</code>, <code>rsi</code>, <code>findFib</code>, <code>fibSideOk</code>) kendi <code>mySignal(bars, helpers)</code> fonksiyonunu yaz, "Çalıştır"a bas, sonucu gör.
        Kod SADECE bu tarayıcıda, izole bir sandbox'ta (iframe) çalışır — sunucuya gönderilmez, hiçbir başka kullanıcı görmez.
      </p>

      <div className="ak-kod-toolbar">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={running}>
          {ALL_SYMBOLS.map(s => <option key={s.sym} value={s.sym}>{s.sym} — {s.name}</option>)}
        </select>
        <button className="ak-btn ak-btn-primary" onClick={run} disabled={running}>
          <Play size={15} /> {running ? "Çalışıyor…" : "Çalıştır"}
        </button>
        <button className="ak-btn ak-btn-secondary sm" onClick={resetTemplate} disabled={running} title="Şablona dön">
          <RotateCcw size={13} /> Şablona dön
        </button>
        {out && !running && out.ms != null && <span className="ak-kod-time">{out.ms} ms</span>}
      </div>

      <div className="ak-kod-editor">
        <CodeMirror
          value={code}
          height="360px"
          theme="dark"
          extensions={[javascript()]}
          onChange={(v) => setCode(v)}
          basicSetup={{ lineNumbers: true, foldGutter: true, tabSize: 2 }}
        />
      </div>

      {out?.error && (
        <div className="ak-kod-error"><AlertTriangle size={14} /> {out.error}</div>
      )}

      {results && (
        <div className="ak-signals">
          <h2>Sonuçlar <span className="ak-soon">{results.length} sonuç</span></h2>
          {results.length === 0 ? (
            <p className="ak-izle-note">Kod çalıştı, hiç sinyal üretmedi.</p>
          ) : (
            <div className="ak-signal-list">
              {results.map((s, k) => {
                const looksLikeSignal = s && typeof s === "object" && (s.dir === 1 || s.dir === -1) && Number.isFinite(s.entry);
                if (looksLikeSignal) {
                  return (
                    <div className={"ak-signal-row " + (s.dir === 1 ? "long" : "short")} key={k}>
                      <span className="dir">{s.dir === 1 ? "LONG" : "SHORT"}</span>
                      {Number.isFinite(s.entry) && <span className="lv">Giriş <b>{fmtP(s.entry)}</b></span>}
                      {Number.isFinite(s.stop) && <span className="lv">Stop <b>{fmtP(s.stop)}</b></span>}
                      {Number.isFinite(s.hedef1) && <span className="lv">Hedef1 <b>{fmtP(s.hedef1)}</b></span>}
                      {Number.isFinite(s.hedef2) && <span className="lv">Hedef2 <b>{fmtP(s.hedef2)}</b></span>}
                      {Number.isFinite(s.i) && <span className="ago">bar #{s.i}</span>}
                    </div>
                  );
                }
                return <div className="ak-signal-row" key={k}><span className="lv">{JSON.stringify(s)}</span></div>;
              })}
            </div>
          )}
        </div>
      )}

      <p className="ak-izle-note">Bu simülasyon/eğitim amaçlıdır; yatırım tavsiyesi değildir. Kod yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez, paylaşılmaz.</p>
    </div>
  );
}
