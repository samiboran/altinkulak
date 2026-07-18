import { useState, useEffect, useMemo } from "react";
import { Film, Play, Pause, RotateCcw, TrendingUp, TrendingDown, Award, ArrowLeft, Lock } from "lucide-react";
import Chart from "../components/Chart.jsx";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { SCENARIOS, scenarioBars, scenarioById } from "../lib/scenarios.js";
import {
  entryPlan, resolveAttemptDetailed, percentileOf,
  fetchScenarioScores, fetchMyScenarioScore, submitScenarioScore,
} from "../lib/replay.js";
import "../styles/senaryo.css";

// AK-083-TAMAMLAMA/C5-C6: Replay Ligi — küratörlü senaryo oynatma. Skorlama replay.js'te
// (ATR-stop/2R-hedef modeli, Lab.jsx'in pratik replay moduyla aynı zihinsel model — D19 ailesi:
// bu bir OYUN, "strateji" değil, sicile de yazılmaz D16).
export default function Senaryo() {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const [scenarioId, setScenarioId] = useState(null);
  const scenario = scenarioId ? scenarioById(scenarioId) : null;
  const bars = useMemo(() => (scenario ? scenarioBars(scenario) : []), [scenario]);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [entry, setEntry] = useState(null); // {idx, dir, exitIdx, plan:{entry,stop,target}}
  const [attempt, setAttempt] = useState(null); // {rScore, exitIdx} — giriş anında hesaplanır (deterministik veri)
  const [myScore, setMyScore] = useState(undefined); // undefined=yükleniyor, null=yok
  const [scores, setScores] = useState([]);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scenario) return;
    setCursor(scenario.revealStart);
    setPlaying(false);
    setEntry(null);
    setAttempt(null);
    setSaveMsg(null);
    setMyScore(user ? undefined : null);
    fetchScenarioScores(scenario.id).then(setScores);
    if (user) fetchMyScenarioScore(scenario.id, user.id).then(setMyScore);
  }, [scenario, user]);

  useEffect(() => {
    if (!playing) return;
    const stopAt = attempt ? attempt.exitIdx : bars.length - 1;
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= stopAt) { setPlaying(false); return c; }
        return c + 1;
      });
    }, 220);
    return () => clearInterval(id);
  }, [playing, attempt, bars.length]);

  function pickScenario(id) { setScenarioId(id); }
  function backToPicker() { setScenarioId(null); }

  function enter(dir) {
    if (entry || !scenario || !bars.length) return;
    const plan = entryPlan(bars, cursor, dir);
    if (!plan) return;
    const detail = resolveAttemptDetailed(bars, cursor, dir);
    setEntry({ idx: cursor, dir, plan });
    setAttempt(detail);
    setPlaying(true);
  }

  async function saveScore() {
    if (!requireAuth("Skorunu kaydetmek için giriş yapmalısın.")) return;
    if (!attempt || saving) return;
    setSaving(true);
    const res = await submitScenarioScore(scenario.id, user.id, attempt.rScore);
    setSaving(false);
    if (res.ok) {
      setMyScore(res.score);
      setSaveMsg(res.alreadyScored ? "Bu senaryonun resmi skoru zaten kayıtlıydı — değişmedi." : "Skorun kaydedildi.");
      fetchScenarioScores(scenario.id).then(setScores);
    } else {
      setSaveMsg(res.error);
    }
  }

  const resolved = !!(entry && attempt && cursor >= attempt.exitIdx);
  const trades = entry ? [{ entryIdx: entry.idx, dir: entry.dir, entry: entry.plan.entry, stop: entry.plan.stop, target: entry.plan.target, outcome: resolved ? attempt.rScore : null }] : null;
  const pct = resolved ? percentileOf(scores, attempt.rScore) : null;

  if (!scenario) {
    return (
      <div className="ak-page ak-senaryo">
        <span className="ak-eyebrow">REPLAY LİGİ</span>
        <h1>Geçmişin karakterini yeniden yaşa.</h1>
        <p className="lead">
          Bu senaryolar <b>temsili/sentetik</b> veridir — bilinen piyasa karakterlerinden (sert çöküş,
          sıkışma, sahte kırılım) esinlenir, gerçek tarihsel fiyat kaydı değildir. Mum mum izle,
          gördüğün anda gir, R skorun otomatik hesaplansın. Pratik — sicile yazılmaz (D16).
        </p>
        <div className="ak-scn-grid">
          {SCENARIOS.map((s) => (
            <button className="ak-scn-card" key={s.id} onClick={() => pickScenario(s.id)}>
              <Film size={20} />
              <span className="ak-scn-title">{s.title}</span>
              <span className="ak-scn-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ak-page ak-senaryo">
      <button className="ak-scn-back" onClick={backToPicker}><ArrowLeft size={14} /> Senaryolar</button>
      <span className="ak-eyebrow">REPLAY LİGİ</span>
      <h1>{scenario.title}</h1>
      <p className="lead">{scenario.desc}</p>

      {myScore !== undefined && myScore !== null && (
        <p className="ak-scn-note">
          <Lock size={13} /> Bu senaryonun resmi skorun: <b className="mono">{Number(myScore.r_score) >= 0 ? "+" : ""}{Number(myScore.r_score).toFixed(2)}R</b> — tekrar oynayabilirsin ama skor değişmez.
        </p>
      )}

      <div className="ak-scn-chart">
        <Chart bars={bars} range={{ start: 0, end: Math.min(cursor, bars.length - 1) }} trades={trades} chartType="candle" symbol={scenario.title} />
      </div>

      <div className="ak-scn-controls">
        <button className="ak-rp play" onClick={() => setPlaying((p) => !p)} disabled={resolved}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <div className="ak-rp-prog"><div style={{ width: `${(cursor / Math.max(1, bars.length - 1)) * 100}%` }} /></div>
        {!entry && (
          <button className="ak-rp txt" onClick={() => { setCursor(scenario.revealStart); setPlaying(false); }}><RotateCcw size={13} /> Başa sar</button>
        )}
      </div>

      {!entry && cursor < bars.length - 1 ? (
        <div className="ak-scn-entry">
          <span>Ne yapardın? Şu an gördüğün mumdan gir:</span>
          <div className="ak-lig-dirs">
            <button className="ak-lig-dir up" onClick={() => enter(1)}><TrendingUp size={15} /> Long</button>
            <button className="ak-lig-dir down" onClick={() => enter(-1)}><TrendingDown size={15} /> Short</button>
          </div>
        </div>
      ) : !entry ? (
        <div className="ak-scn-entry">
          <p className="ak-lig-note">Senaryo bitti — giriş fırsatı kaçtı. Baştan dene.</p>
          <button className="ak-rp txt" onClick={() => { setCursor(scenario.revealStart); setPlaying(false); }}><RotateCcw size={13} /> Başa sar</button>
        </div>
      ) : !resolved ? (
        <p className="ak-lig-note">Pozisyon açık, oynatılıyor…</p>
      ) : (
        <div className={"ak-scn-result" + (attempt.rScore > 0 ? " hit" : attempt.rScore < 0 ? " miss" : "")}>
          <div className="ak-scn-result-head">
            <Award size={16} />
            <span>Sonuç: <b className="mono">{attempt.rScore >= 0 ? "+" : ""}{attempt.rScore.toFixed(2)}R</b></span>
          </div>
          {pct != null ? (
            <p className="ak-lig-note">Bu senaryoda oynayanların <b>%{pct}</b>'inden daha iyi bir sonuç aldın.</p>
          ) : (
            <p className="ak-lig-note">Bu senaryoda henüz kıyaslanacak yeterli kayıt yok — ilk denemelerden birisin.</p>
          )}
          {(myScore === null || myScore === undefined) && (
            <button className="ak-btn ak-btn-primary" onClick={saveScore} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Resmi skorun olarak kaydet"}
            </button>
          )}
          {saveMsg && <p className="ak-lig-note">{saveMsg}</p>}
        </div>
      )}
    </div>
  );
}
