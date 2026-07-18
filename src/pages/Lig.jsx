import { useState, useEffect } from "react";
import { Target, Lock, TrendingUp, TrendingDown, Award, Brain, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { fetchProfilesByIds } from "../lib/supabase.js";
import {
  fetchActiveQuestion, fetchMyPrediction, lockPrediction,
  fetchResolvedPredictions, fetchMyResolvedPredictions, groupByUser,
  fetchMyLastResolvedResult, fetchMyResolvedPredictionsWithDates,
} from "../lib/predictions.js";
import { leaderboard, calibrationCurve, overconfidence, brierScore } from "../lib/brier.js";
import "../styles/lig.css";

// AK-083: Tahmin Ligi v1. Skorlama brier.js'te (buraya kopyalanmaz). Guest aktif soruyu görür,
// kilitlemek AuthGate ister (D — AK-080 ilkesi: sayfa yönlendirmesi yok, inline nudge).
function fmtCloses(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Lig() {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();

  const [question, setQuestion] = useState(null);
  const [qLoading, setQLoading] = useState(true);
  const [myPred, setMyPred] = useState(null);
  const [dir, setDir] = useState("up");
  const [conf, setConf] = useState(0.7);
  const [locking, setLocking] = useState(false);

  const [board, setBoard] = useState([]);
  const [handles, setHandles] = useState({});
  const [boardLoading, setBoardLoading] = useState(true);
  const [globalCurve, setGlobalCurve] = useState(null); // "son sonuç" zorunlu dersi için (D6: HERKESİN verisi)
  const [myCurve, setMyCurve] = useState(null);
  const [myOver, setMyOver] = useState(null);
  const [lastResult, setLastResult] = useState(undefined); // undefined=yükleniyor, null=yok
  const [weeklyHistory, setWeeklyHistory] = useState([]);

  useEffect(() => {
    let on = true;
    setQLoading(true);
    fetchActiveQuestion().then((q) => { if (on) { setQuestion(q); setQLoading(false); } });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    let on = true;
    if (!user || !question) { setMyPred(null); return; }
    fetchMyPrediction(question.id, user.id).then((p) => { if (on) setMyPred(p); });
    return () => { on = false; };
  }, [user, question]);

  // Lig tablosu (herkese açık — çözülmüş sorulardan) + handle çözümü + HERKESİN kalibrasyon
  // eğrisi (globalCurve) — "son sonuç" zorunlu dersi (C4) kendi güven aralığında herkes ne
  // kadar tuttu diye sorar, o yüzden burada (yalnız kendi rows'unda değil) hesaplanır.
  useEffect(() => {
    let on = true;
    setBoardLoading(true);
    fetchResolvedPredictions().then(async (rows) => {
      if (!on) return;
      setGlobalCurve(calibrationCurve(rows));
      const rows2 = leaderboard(groupByUser(rows));
      setBoard(rows2);
      const map = await fetchProfilesByIds(rows2.map((r) => r.userId));
      if (on) { setHandles(map); setBoardLoading(false); }
    });
    return () => { on = false; };
  }, []);

  // AK-083-TAMAMLAMA/C4: en son çözülen sorudaki sonucun — atlanamaz kalibrasyon dersi.
  useEffect(() => {
    let on = true;
    if (!user) { setLastResult(null); return; }
    setLastResult(undefined);
    fetchMyLastResolvedResult(user.id).then((r) => { if (on) setLastResult(r); });
    return () => { on = false; };
  }, [user]);

  // AK-083-TAMAMLAMA/C2: geçmiş haftaların Brier dağılımı (en yeni 8 hafta).
  useEffect(() => {
    let on = true;
    if (!user) { setWeeklyHistory([]); return; }
    fetchMyResolvedPredictionsWithDates(user.id).then((rows) => {
      if (!on) return;
      const sorted = [...(rows || [])].sort((a, b) => new Date(a.closesAt) - new Date(b.closesAt));
      const withBrier = sorted.map((r) => ({ ...r, brier: brierScore(r.confidence, r.hit) }));
      setWeeklyHistory(withBrier.slice(-8));
    });
    return () => { on = false; };
  }, [user]);

  // Kişisel kalibrasyon eğrisi + aşırı özgüven dersi — yalnız kendi geçmişin (D6: başkasının
  // tahmini bu cihazdan fabrike edilip "senin" gibi gösterilemez)
  useEffect(() => {
    let on = true;
    if (!user) { setMyCurve(null); setMyOver(null); return; }
    fetchMyResolvedPredictions(user.id).then((rows) => {
      if (!on) return;
      setMyCurve(calibrationCurve(rows));
      setMyOver(overconfidence(rows));
    });
    return () => { on = false; };
  }, [user]);

  async function doLock() {
    if (!requireAuth("Tahmin kilitlemek için giriş yapmalısın.")) return;
    if (!question || locking || myPred) return;
    setLocking(true);
    const res = await lockPrediction(question.id, user.id, dir, conf);
    setLocking(false);
    if (res.ok && res.prediction) setMyPred(res.prediction);
  }

  return (
    <div className="ak-page ak-lig">
      <span className="ak-eyebrow">TAHMİN LİGİ</span>
      <h1>Yönünü tahmin et, güvenini ölç.</h1>
      <p className="lead">
        Doğru bilmek yetmez — <b>ne kadar emin olduğun</b> da ölçülür. Brier skoru düşük olan kazanır:
        %90 dedin ve tuttu → iyi; %90 dedin ve tutmadı → kötü, %55 dedin ve tutmadı → o kadar da kötü değil.
        Aşırı özgüveni terbiye eden, dürüst bir oyun.
      </p>

      <section className="ak-lig-sec">
        <h2><Target size={16} /> Haftanın sorusu</h2>
        {qLoading ? (
          <p className="ak-lig-note">Yükleniyor…</p>
        ) : !question ? (
          <div className="ak-lig-empty"><Target size={24} /><p>Şu an aktif bir soru yok. Bir sonraki soru açıldığında burada görünecek.</p></div>
        ) : (
          <div className="ak-lig-card">
            <div className="ak-lig-q">
              <span className="ak-lig-sym">{question.sym}</span>
              <p>{question.question_text}</p>
              <span className="ak-lig-closes">Kilit kapanışı: {fmtCloses(question.closes_at)}</span>
            </div>

            {myPred ? (
              <div className="ak-lig-locked">
                <Lock size={16} />
                <span>Tahminin kilitli: <b>{myPred.direction === "up" ? "Yukarı" : "Aşağı"}</b> · güven %{Math.round(myPred.confidence * 100)}</span>
              </div>
            ) : (
              <div className="ak-lig-form">
                <div className="ak-lig-dirs">
                  <button className={"ak-lig-dir" + (dir === "up" ? " on up" : "")} onClick={() => setDir("up")}><TrendingUp size={15} /> Yukarı</button>
                  <button className={"ak-lig-dir" + (dir === "down" ? " on down" : "")} onClick={() => setDir("down")}><TrendingDown size={15} /> Aşağı</button>
                </div>
                <label className="ak-lig-conf">
                  <span>Güvenin — <b>%{Math.round(conf * 100)}</b></span>
                  <input type="range" min="0.5" max="0.95" step="0.05" value={conf} onChange={(e) => setConf(Number(e.target.value))} />
                </label>
                <button className="ak-btn ak-btn-primary" onClick={doLock} disabled={locking}>
                  <Lock size={14} /> {locking ? "Kilitleniyor…" : "Kilitle"}
                </button>
                <p className="ak-lig-note">Kilitlendikten sonra değiştirilemez ya da silinemez — tahmin gerçek bir tahmindir.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {user && (
        <section className="ak-lig-sec">
          <h2><CheckCircle2 size={16} /> Son sonuç</h2>
          {lastResult === undefined ? (
            <p className="ak-lig-note">Yükleniyor…</p>
          ) : !lastResult ? (
            <div className="ak-lig-empty"><CheckCircle2 size={24} /><p>Henüz çözülmüş bir tahminin yok — ilk sonuç geldiğinde burada görünecek.</p></div>
          ) : (() => {
            const q = lastResult.question;
            const hit = lastResult.direction === q.outcome;
            const myBrier = brierScore(lastResult.confidence, hit);
            const bucket = (globalCurve || []).find((b) => lastResult.confidence >= b.lo && lastResult.confidence < b.hi);
            return (
              <div className={"ak-lig-result" + (hit ? " hit" : " miss")}>
                <div className="ak-lig-result-head">
                  <span className="ak-lig-sym">{q.sym}</span>
                  {hit
                    ? <span className="ak-lig-verdict hit"><CheckCircle2 size={15} /> Doğru</span>
                    : <span className="ak-lig-verdict miss"><XCircle size={15} /> Yanlış</span>}
                </div>
                <p>{q.question_text}</p>
                <div className="ak-lig-result-stats">
                  <span>Senin yönün: <b>{lastResult.direction === "up" ? "Yukarı" : "Aşağı"}</b></span>
                  <span>Gerçekleşen: <b>{q.outcome === "up" ? "Yukarı" : "Aşağı"}</b></span>
                  <span>Brier skorun: <b className="mono">{myBrier.toFixed(3)}</b></span>
                </div>
                <p className="ak-lig-lesson">
                  {bucket && bucket.n >= 4
                    ? <>Bu ligde %{Math.round(lastResult.confidence * 100)} diyenlerin %{Math.round(bucket.hitRate * 100)}'i tuttu (n={bucket.n}) — kalibrasyonunu buna göre değerlendir.</>
                    : <>Bu güven aralığında henüz kıyaslanacak yeterli veri yok — ligde katılım arttıkça burası dolacak.</>}
                </p>
              </div>
            );
          })()}
        </section>
      )}

      <section className="ak-lig-sec">
        <h2><Award size={16} /> Lig tablosu <span className="ak-soon">çözülmüş sorular</span></h2>
        {boardLoading ? (
          <p className="ak-lig-note">Yükleniyor…</p>
        ) : board.length === 0 ? (
          <div className="ak-lig-empty"><Award size={24} /><p>Henüz çözülmüş bir soru yok — ilk lig tablosu burada oluşacak.</p></div>
        ) : (
          <div className="ak-lig-table">
            <div className="ak-lig-th"><span>#</span><span>Kullanıcı</span><span>Ort. Brier</span><span>Katılım</span></div>
            {board.map((r, i) => (
              <div className={"ak-lig-tr" + (r.ranked ? "" : " unranked")} key={r.userId}>
                <span className="mono">{r.ranked ? i + 1 : "—"}</span>
                <span>@{handles[r.userId] || "?"}</span>
                <span className="mono">{r.avg.toFixed(3)}</span>
                <span className="mono">{r.n}{!r.ranked && <em className="ak-soon">sıralama dışı</em>}</span>
              </div>
            ))}
          </div>
        )}
        <p className="ak-lig-note">Sıralamaya girmek için en az 4 çözülmüş tahmin gerekir — tek şanslı tahminle lig kazanılmasın diye.</p>
      </section>

      <section className="ak-lig-sec">
        <h2><Brain size={16} /> Kendi kalibrasyonun</h2>
        {!user ? (
          <div className="ak-lig-empty"><Brain size={24} /><p>Giriş yap ve tahmin etmeye başla — kalibrasyon eğrin burada oluşsun.</p></div>
        ) : !myCurve || !myCurve.some((b) => b.n > 0) ? (
          <div className="ak-lig-empty"><Brain size={24} /><p>Henüz çözülmüş bir tahminin yok — ilk sonuç geldiğinde kalibrasyon eğrin burada görünecek.</p></div>
        ) : (
          <>
            <div className="ak-lig-calib">
              {myCurve.filter((b) => b.n > 0).map((b) => (
                <div className="ak-lig-calib-row" key={b.lo}>
                  <span className="ak-lig-calib-lbl">%{Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}</span>
                  <div className="ak-lig-calib-bars">
                    <div className="ak-lig-calib-bar conf" style={{ width: `${(b.avgConf * 100).toFixed(0)}%` }} />
                    <div className="ak-lig-calib-bar hit" style={{ width: `${(b.hitRate * 100).toFixed(0)}%` }} />
                  </div>
                  <span className="ak-lig-calib-n">n={b.n}</span>
                </div>
              ))}
              <div className="ak-lig-calib-legend">
                <span><i className="conf" /> Ortalama güvenin</span>
                <span><i className="hit" /> Gerçek isabet oranın</span>
              </div>
            </div>
            {myOver != null && (
              <p className="ak-lig-lesson">
                {myOver > 0.05
                  ? <>Ortalamada güvenin isabetinden <b>%{Math.round(myOver * 100)}</b> daha yüksek — biraz fazla özgüvenlisin.</>
                  : myOver < -0.05
                    ? <>Ortalamada isabetin güveninden <b>%{Math.round(-myOver * 100)}</b> daha yüksek — olduğundan az güveniyorsun, daha cesur tahmin edebilirsin.</>
                    : <>Güvenin ve isabetin birbirine oldukça yakın — iyi kalibre edilmişsin.</>}
              </p>
            )}
            {weeklyHistory.length > 1 && (
              <div className="ak-lig-weekly">
                <span className="ak-lig-weekly-lbl">Son {weeklyHistory.length} haftanın Brier skorların <span className="ak-soon">düşük iyi</span></span>
                <div className="ak-lig-weekly-bars">
                  {weeklyHistory.map((w, i) => {
                    const pct = Math.max(4, Math.min(100, Math.round((1 - w.brier / 0.5) * 100)));
                    return (
                      <div className="ak-lig-weekly-bar" key={i} title={`${w.brier.toFixed(3)}`}>
                        <div className={"ak-lig-weekly-fill" + (w.hit ? " hit" : " miss")} style={{ height: `${pct}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
