import { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { Play, AlertTriangle, RotateCcw, Wand2 } from "lucide-react";
import { getBars, hasData, ALL_SYMBOLS } from "../lib/data.js";
import { runUserCode } from "../lib/sandboxRunner.js";
import { hasParamsBlock, extractParams } from "../lib/paramsBlock.js";
import "../styles/kodeditoru.css";
import "../styles/izleme.css"; // AK-065: sonuç listesi Izleme'deki sinyal satırı stiliyle aynı

const PARAMS_DEBOUNCE_MS = 500; // AK-084/S1: kod→grafik senkronu her tuşta değil, yazma durunca tetiklenir

// AK-073: KodEditoru.jsx'teki editör+çalıştır+şablon arayüzü buraya taşındı — hem KodEditoru.jsx
// (bağımsız/deneysel sayfa) hem Lab.jsx ("Kendi Kodum" sekmesi, grafiğe bağlı) bu bileşeni kullanır.

// AK-067: "Basit Mod" — checkbox seçimlerinden AK-065 sözleşmesine uyan (mySignal(bars,helpers))
// kod YEREL olarak (API çağrısı yok, maliyet sıfır) metin birleştirmeyle üretilir.
const DIR_LABEL = { both: "İkisi", long: "Long", short: "Short" };

function buildSimpleCode({ useFvg, useFib, useRsi, dirPref, fromDate, toDate }) {
  const active = [];
  if (useFvg) active.push("FVG");
  if (useFib) active.push("Fibonacci (OTE)");
  if (useRsi) active.push("RSI");

  const fromMs = fromDate ? new Date(fromDate + "T00:00:00.000Z").getTime() : null;
  const toMs = toDate ? new Date(toDate + "T23:59:59.999Z").getTime() : null;

  const L = [];
  L.push("// Basit Mod tarafından otomatik üretildi — düzenleyebilirsin.");
  L.push(`// Seçili yapı taşları: ${active.length ? active.join(" + ") : "(yok)"} · yön: ${DIR_LABEL[dirPref] || "İkisi"}`);
  L.push("function mySignal(bars, helpers) {");
  L.push("  var atr = helpers.atr, rsi = helpers.rsi, findFib = helpers.findFib;");
  L.push(`  var fromMs = ${fromMs != null ? fromMs : "null"}, toMs = ${toMs != null ? toMs : "null"};`);
  L.push("  var a14 = atr(bars, 14);");
  if (useRsi) L.push("  var rsiArr = rsi(bars, 14);");
  L.push("  var out = [];");
  L.push("  for (var i = 60; i < bars.length; i++) {");
  L.push("    var b = bars[i];");
  L.push("    if (b.time != null) { if (fromMs != null && b.time < fromMs) continue; if (toMs != null && b.time > toMs) continue; }");
  L.push("    var dirs = [];");
  if (useFvg) {
    L.push("    var fvgDir = null;");
    L.push("    if (bars[i - 2].h < b.l) fvgDir = 1; else if (bars[i - 2].l > b.h) fvgDir = -1;");
    L.push("    if (fvgDir == null) continue;");
    L.push("    dirs.push(fvgDir);");
  }
  if (useFib) {
    L.push("    var fib = findFib(bars.slice(0, i + 1), 60);");
    L.push("    if (!fib) continue;");
    L.push("    var oteLo = Math.min(fib.ote.a, fib.ote.b), oteHi = Math.max(fib.ote.a, fib.ote.b);");
    L.push("    if (b.c < oteLo || b.c > oteHi) continue;");
    L.push("    dirs.push(fib.up ? 1 : -1);");
  }
  if (useRsi) {
    L.push("    var rv = rsiArr[i];");
    L.push("    if (rv == null) continue;");
    L.push("    var rsiDir = rv < 30 ? 1 : (rv > 70 ? -1 : null);");
    L.push("    if (rsiDir == null) continue;");
    L.push("    dirs.push(rsiDir);");
  }
  L.push("    if (dirs.length === 0) continue;"); // hiç yapı taşı seçilmemiş — sinyal yok
  L.push("    var dir = dirs[0];");
  L.push("    for (var k = 1; k < dirs.length; k++) if (dirs[k] !== dir) { dir = null; break; }");
  L.push("    if (dir == null) continue;"); // seçili yapı taşları aynı yönde anlaşmadı
  if (dirPref === "long") L.push("    if (dir !== 1) continue;");
  if (dirPref === "short") L.push("    if (dir !== -1) continue;");
  L.push("    var r0 = a14[i];");
  L.push("    if (!r0) continue;");
  L.push("    var risk = r0 * 2;");
  L.push("    var entry = b.c;");
  L.push("    var stop = dir === 1 ? entry - risk : entry + risk;");
  L.push("    var hedef1 = dir === 1 ? entry + risk : entry - risk;");
  L.push("    var hedef2 = dir === 1 ? entry + risk * 3 : entry - risk * 3;");
  L.push("    out.push({ i: i, dir: dir, entry: entry, stop: stop, hedef1: hedef1, hedef2: hedef2 });");
  L.push("  }");
  L.push("  return out;");
  L.push("}");
  return L.join("\n") + "\n";
}

export const LSKEY = "ak_user_scripts_v1";

export const TEMPLATE = `// Kendi sinyal kuralın — bars: {o,h,l,c,t,time?,v?} dizisi (eskiden yeniye sıralı)
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

export function loadSavedCode() {
  try {
    const saved = JSON.parse(localStorage.getItem(LSKEY));
    if (saved && typeof saved === "object" && typeof saved.code === "string") return saved.code;
  } catch { /* bozuk kayıt — şablona düş */ }
  return TEMPLATE;
}

export function loadSavedSymbol(fallback = "SOL") {
  try {
    const saved = JSON.parse(localStorage.getItem(LSKEY));
    if (saved && typeof saved === "object" && typeof saved.symbol === "string") return saved.symbol;
  } catch { /* bozuk kayıt — varsayılana düş */ }
  return fallback;
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

// props:
//   symbol            — hangi sembolde çalışacak (kontrollü, zorunlu)
//   onSymbolChange     — sağlanırsa dahili sembol seçici gösterilir (showSymbolPicker ile birlikte)
//   showSymbolPicker   — true: kendi sembol seçicisini gösterir (KodEditoru.jsx bağımsız modda); false: gizler (Lab.jsx zaten kendi sembol arama kutusuna sahip)
//   showResultsList    — true: "Sonuçlar" listesini (Izleme sinyal satırı stiliyle) kendi içinde gösterir; false: sonucu yalnız onRunResult ile dışa verir (Lab.jsx grafik+Sonuç paneline bağlar)
//   onRunResult        — her çalıştırma tamamlandığında çağrılır: ({ok, result, error, ms}) => void
//   onCodeChange       — kod her değiştiğinde çağrılır: (code: string) => void — Lab.jsx OOS turu için son kodu izler
//   onParamsChange     — AK-084/S1: kod değişip 500ms sakinleşince çağrılır: (params|null, {malformed:boolean}) => void
//                        params null + malformed=false → blok hiç yok (normal). params null + malformed=true → blok var ama parse edilemedi (PARAMS okunamadı rozeti).
//   externalCode       — AK-084/S2/C4: Lab.jsx'ten (pozisyon kutusu sürüklemesi ya da Strateji Çıkarıcı) enjekte edilen kod
//   externalCodeVersion— externalCode her değiştiğinde bir artan sayaç — aynı string iki kez gelse bile yeniden uygulanabilsin diye
//   flashVersion       — arttıkça editör 1sn sarı flash yapar (PARAMS'ın grafikten güncellendiğini görsel doğrular)
export default function SistemimKoduPanel({
  symbol,
  onSymbolChange = null,
  showSymbolPicker = true,
  showResultsList = true,
  onRunResult = null,
  onCodeChange = null,
  onParamsChange = null,
  externalCode = null,
  externalCodeVersion = 0,
  flashVersion = 0,
}) {
  const [code, setCode] = useState(loadSavedCode);
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState(null); // {ok, result, error, ms}
  const runToken = useRef(0); // eskimiş (üst üste tıklanmış) çalıştırmaların sonucu yok sayılır
  const [paramsMalformed, setParamsMalformed] = useState(false); // AK-084/S1: blok var ama parse edilemedi
  const [flash, setFlash] = useState(false);
  const appliedExternalVersion = useRef(0);

  // AK-084/S2/C4: Lab.jsx yeni kod enjekte ettiğinde (sürükleme sonrası upsertParams ya da
  // Strateji Çıkarıcı'nın "Kodu üret" çıktısı) editör buna geçer. Kullanıcı kodu ASLA sessizce
  // ezilmez — yalnız version gerçekten ilerlediğinde uygulanır.
  useEffect(() => {
    if (externalCode == null) return;
    if (externalCodeVersion <= appliedExternalVersion.current) return;
    appliedExternalVersion.current = externalCodeVersion;
    setCode(externalCode);
  }, [externalCode, externalCodeVersion]);

  useEffect(() => {
    if (flashVersion <= 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(t);
  }, [flashVersion]);

  // AK-084/S1: kod→grafik senkronu — 500ms debounce, blok yoksa sessiz, bozuksa rozet.
  useEffect(() => {
    const t = setTimeout(() => {
      const hasBlock = hasParamsBlock(code);
      const params = extractParams(code);
      setParamsMalformed(hasBlock && !params);
      onParamsChange && onParamsChange(params, { malformed: hasBlock && !params });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, PARAMS_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // AK-067: Basit Mod — kod yazmadan checkbox kombinasyonu
  const [mode, setMode] = useState("kod"); // "kod" | "basit"
  const [sFvg, setSFvg] = useState(true);
  const [sFib, setSFib] = useState(false);
  const [sRsi, setSRsi] = useState(true);
  const [sDir, setSDir] = useState("both");
  const [sFrom, setSFrom] = useState("");
  const [sTo, setSTo] = useState("");
  const noneSelected = !sFvg && !sFib && !sRsi;

  function generateSimple() {
    if (noneSelected) return;
    const generated = buildSimpleCode({ useFvg: sFvg, useFib: sFib, useRsi: sRsi, dirPref: sDir, fromDate: sFrom, toDate: sTo });
    setCode(generated);
    setOut(null);
    setMode("kod");
  }

  useEffect(() => {
    try { localStorage.setItem(LSKEY, JSON.stringify({ code, symbol })); } catch { /* kotayı aşarsa sessiz geç */ }
    onCodeChange && onCodeChange(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, symbol]);

  async function run() {
    if (!hasData(symbol)) {
      const errOut = { ok: false, error: `${symbol} için veri yok.` };
      setOut(errOut);
      onRunResult && onRunResult(errOut);
      return;
    }
    const bars = getBars(symbol);
    const token = ++runToken.current;
    setRunning(true);
    setOut(null);
    const t0 = performance.now();
    // AK-084/S3: mySignal'e helpers.params olarak extractParams sonucu geçilir — aynı kaynak,
    // grafikteki kutularla senkron çalışsın (debounce beklemeden, ÇALIŞTIR anındaki en güncel kodla).
    const res = await runUserCode(code, bars, extractParams(code));
    if (token !== runToken.current) return; // bu arada yeni bir çalıştırma başlamış — atla
    setRunning(false);
    const full = { ...res, ms: Math.round(performance.now() - t0) };
    setOut(full);
    onRunResult && onRunResult(full);
  }

  function resetTemplate() {
    if (running) return;
    setCode(TEMPLATE);
    setOut(null);
  }

  const results = Array.isArray(out?.result) ? out.result : null;

  return (
    <div className="ak-kod-panel">
      <div className="ak-kod-modes">
        <button className={"ak-kod-tab" + (mode === "kod" ? " on" : "")} onClick={() => setMode("kod")}>Kod</button>
        <button className={"ak-kod-tab" + (mode === "basit" ? " on" : "")} onClick={() => setMode("basit")}><Wand2 size={13} /> Basit Mod</button>
      </div>

      {mode === "basit" && (
        <div className="ak-kod-basit">
          <p className="ak-kod-basit-lead">Kod yazmadan hazır yapı taşlarını birleştir — seçimlerine göre kod bu tarayıcıda, yerel olarak (yapay zekâ/API kullanılmadan) üretilir.</p>
          <div className="ak-kod-basit-row">
            <label><input type="checkbox" checked={sFvg} onChange={() => setSFvg(v => !v)} /> FVG (boşluk)</label>
            <label><input type="checkbox" checked={sFib} onChange={() => setSFib(v => !v)} /> Fibonacci (OTE bölgesi)</label>
            <label><input type="checkbox" checked={sRsi} onChange={() => setSRsi(v => !v)} /> RSI (aşırı alım/satım)</label>
          </div>
          <div className="ak-kod-basit-row">
            <label className="ak-kod-basit-sel">
              <span>Yön</span>
              <select value={sDir} onChange={(e) => setSDir(e.target.value)}>
                <option value="both">İkisi</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className="ak-kod-basit-sel">
              <span>Tarih (başlangıç)</span>
              <input type="date" value={sFrom} onChange={(e) => setSFrom(e.target.value)} />
            </label>
            <label className="ak-kod-basit-sel">
              <span>Tarih (bitiş)</span>
              <input type="date" value={sTo} onChange={(e) => setSTo(e.target.value)} />
            </label>
          </div>
          {noneSelected && <p className="ak-kod-basit-warn">En az bir yapı taşı seç.</p>}
          <button className="ak-btn ak-btn-primary" onClick={generateSimple} disabled={noneSelected}>
            <Wand2 size={15} /> Kodu Oluştur ve Editöre Yaz
          </button>
        </div>
      )}

      <div className="ak-kod-toolbar">
        {showSymbolPicker && (
          <select value={symbol} onChange={(e) => onSymbolChange && onSymbolChange(e.target.value)} disabled={running}>
            {ALL_SYMBOLS.map(s => <option key={s.sym} value={s.sym}>{s.sym} — {s.name}</option>)}
          </select>
        )}
        <button className="ak-btn ak-btn-primary" onClick={run} disabled={running}>
          <Play size={15} /> {running ? "Çalışıyor…" : "Çalıştır"}
        </button>
        <button className="ak-btn ak-btn-secondary sm" onClick={resetTemplate} disabled={running} title="Şablona dön">
          <RotateCcw size={13} /> Şablona dön
        </button>
        {out && !running && out.ms != null && <span className="ak-kod-time">{out.ms} ms</span>}
        {paramsMalformed && (
          <span className="ak-kod-params-warn" title="AK-PARAMS bloğu var ama okunamadı — kod DEĞİŞTİRİLMEDİ, kutular son geçerli halde kaldı.">
            <AlertTriangle size={12} /> PARAMS okunamadı
          </span>
        )}
      </div>

      <div className={"ak-kod-editor" + (flash ? " flash" : "")}>
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

      {showResultsList && results && (
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

      {showResultsList && (
        <p className="ak-izle-note">Bu simülasyon/eğitim amaçlıdır; yatırım tavsiyesi değildir. Kod yalnızca bu tarayıcıda saklanır, sunucuya gönderilmez, paylaşılmaz.</p>
      )}
    </div>
  );
}
