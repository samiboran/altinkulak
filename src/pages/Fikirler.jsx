import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown, Flag, Info, X } from "lucide-react";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { fetchProfilesByIds } from "../lib/supabase.js";
import { fetchLifetimePoints } from "../lib/points.js";
import { contribRank } from "../lib/ranks.js";
import { containsOrderLanguage } from "../lib/moderation.js";
import {
  fetchIdeas, createIdea, fetchReactionCounts, fetchMyReactions, reactToIdea, reportIdea,
  fetchTodayKatilmiyorumCount, KATILMIYORUM_DAILY_LIMIT,
} from "../lib/ideas.js";
import "../styles/fikirler.css";

// AK-090: Topluluk Fikirleri — sinyal servisi DEĞİL. D19/D21 ruhu: elle seçilmiş bir tez
// nasıl HİPOTEZ'se (Strateji Çıkarıcı), burada da bir fikir yalnızca bir TEZ — "al/sat" emri değil.
const REPORT_REASONS = [
  ["spam", "Spam"],
  ["kufur", "Küfür/uygunsuz dil"],
  ["sinyal", "Israrlı sinyal/emir dili"],
  ["diger", "Diğer"],
];

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Fikirler() {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();

  const [ideas, setIdeas] = useState(null); // null = yükleniyor
  const [handles, setHandles] = useState({});
  const [ranks, setRanks] = useState({}); // userId -> contribRank()
  const [counts, setCounts] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [todayKatilmiyorum, setTodayKatilmiyorum] = useState(0);

  const [symbol, setSymbol] = useState("");
  const [thesis, setThesis] = useState("");
  const [formErr, setFormErr] = useState(null);
  const [pendingWarn, setPendingWarn] = useState(false); // emir-dili tespit edildi, onay bekleniyor
  const [posting, setPosting] = useState(false);

  const [reportFor, setReportFor] = useState(null); // idea id
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0][0]);
  const [reportNote, setReportNote] = useState("");
  const [reportMsg, setReportMsg] = useState(null);

  async function loadIdeas() {
    const rows = await fetchIdeas(30);
    setIdeas(rows);
    const ids = rows.map((r) => r.id);
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const [handleMap, countMap, mineMap] = await Promise.all([
      fetchProfilesByIds(userIds),
      fetchReactionCounts(ids),
      user ? fetchMyReactions(ids, user.id) : Promise.resolve({}),
    ]);
    setHandles(handleMap);
    setCounts(countMap);
    setMyReactions(mineMap);
    // Rütbe rozeti (C7) — sayfa başına bounded (30 yazar), N+1 ama sayfalı/paralel (points.js'te
    // toplu bir "lifetime by ids" yok, tek tek fetchLifetimePoints ile aynı ilke).
    const rankEntries = await Promise.all(userIds.map(async (uid) => [uid, contribRank(await fetchLifetimePoints(uid))]));
    setRanks(Object.fromEntries(rankEntries));
  }

  useEffect(() => { loadIdeas(); }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!user) { setTodayKatilmiyorum(0); return; }
    fetchTodayKatilmiyorumCount(user.id).then(setTodayKatilmiyorum);
  }, [user]);

  function trySubmit() {
    if (!requireAuth("Fikir paylaşmak için giriş yapmalısın.")) return;
    setFormErr(null);
    if (containsOrderLanguage(thesis)) { setPendingWarn(true); return; }
    doSubmit();
  }

  async function doSubmit() {
    setPosting(true);
    const res = await createIdea(user.id, { symbol, thesis });
    setPosting(false);
    setPendingWarn(false);
    if (!res.ok) { setFormErr(res.error); return; }
    setSymbol("");
    setThesis("");
    loadIdeas();
  }

  async function react(idea, type) {
    if (!requireAuth("Tepki vermek için giriş yapmalısın.")) return;
    if (myReactions[idea.id]) return;
    if (type === "katilmiyorum" && todayKatilmiyorum >= KATILMIYORUM_DAILY_LIMIT) return;
    const res = await reactToIdea(idea.id, idea.user_id, user.id, type);
    if (res.ok) {
      setCounts((c) => ({ ...c, [idea.id]: { ...c[idea.id], [type]: (c[idea.id]?.[type] || 0) + 1 } }));
      setMyReactions((m) => ({ ...m, [idea.id]: type }));
      if (type === "katilmiyorum") setTodayKatilmiyorum((n) => n + 1);
    }
  }

  function openReport(ideaId) {
    if (!requireAuth("Bildirmek için giriş yapmalısın.")) return;
    setReportFor(ideaId);
    setReportReason(REPORT_REASONS[0][0]);
    setReportNote("");
    setReportMsg(null);
  }

  async function submitReport() {
    const res = await reportIdea(reportFor, user.id, reportReason, reportNote);
    setReportMsg(res.ok ? "Bildirildi, teşekkürler." : res.error);
    if (res.ok) setTimeout(() => setReportFor(null), 900);
  }

  const thesisLen = thesis.trim().length;
  const katilmiyorumLeft = Math.max(0, KATILMIYORUM_DAILY_LIMIT - todayKatilmiyorum);

  return (
    <div className="ak-page ak-fikirler">
      <span className="ak-eyebrow">TOPLULUK FİKİRLERİ</span>
      <h1>Tezini paylaş, gürültüyü değil sinyali duy.</h1>
      <p className="lead">
        Bu bir sinyal servisi değil — "al/sat" emri yok, yalnız <b>tez</b> var: neye bakıyorsun,
        neyi görürsen fikrin çürür? Herkes paylaşabilir, rütbe zaten güvenilirlik sinyali verir.
      </p>

      <section className="ak-fik-composer">
        <input
          className="ak-fik-sym" placeholder="Sembol (örn. BTC)" value={symbol} maxLength={12}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <textarea
          className="ak-fik-thesis" placeholder="Tezin / Neden böyle düşünüyorsun? (en az 40 karakter)"
          value={thesis} onChange={(e) => setThesis(e.target.value)} rows={4}
        />
        <div className="ak-fik-composer-foot">
          <span className="ak-fik-count">{thesisLen}/40+</span>
          <button className="ak-btn ak-btn-primary" onClick={trySubmit} disabled={posting || !symbol.trim()}>
            {posting ? "Paylaşılıyor…" : "Paylaş"}
          </button>
        </div>
        {formErr && <p className="ak-fik-err">{formErr}</p>}
      </section>

      {pendingWarn && (
        <div className="ak-modal-veil" onClick={() => setPendingWarn(false)}>
          <div className="ak-modal ak-fik-warn" onClick={(e) => e.stopPropagation()}>
            <Info size={22} />
            <h3>Bu bir analiz platformu</h3>
            <p>"Alın/satın/kesin/garanti" gibi ifadeler yerine tezini anlat — neye baktın, neyi görürsen fikrin çürür? Bu bir uyarı, engel değil; istersen olduğu gibi paylaşabilirsin.</p>
            <div className="ak-modal-btns">
              <button className="ak-btn ak-btn-secondary" onClick={() => setPendingWarn(false)}>Tezimi düzenleyeyim</button>
              <button className="ak-btn ak-btn-primary" onClick={doSubmit} disabled={posting}>{posting ? "Paylaşılıyor…" : "Yine de paylaş"}</button>
            </div>
          </div>
        </div>
      )}

      <section className="ak-fik-list">
        {ideas === null ? (
          <p className="ak-fik-hint">Yükleniyor…</p>
        ) : ideas.length === 0 ? (
          <div className="ak-fik-empty"><p>Henüz paylaşılmış bir fikir yok — ilkini sen paylaş.</p></div>
        ) : (
          ideas.map((idea) => {
            const c = counts[idea.id] || { faydali: 0, katilmiyorum: 0 };
            const mine = myReactions[idea.id];
            const rank = ranks[idea.user_id];
            return (
              <article className="ak-fik-card" key={idea.id}>
                <div className="ak-fik-card-head">
                  <span className="ak-fik-sym-tag">{idea.symbol}</span>
                  <span className="ak-fik-author">@{handles[idea.user_id] || "?"}</span>
                  {rank && <span className="ak-fik-rank">{rank.name}</span>}
                  <span className="ak-fik-date">{fmtDate(idea.created_at)}</span>
                </div>
                <p className="ak-fik-thesis-text">{idea.thesis}</p>
                <p className="ak-fik-disclaimer">Eğitim amaçlıdır, yatırım tavsiyesi değildir.</p>
                <div className="ak-fik-card-foot">
                  <button className={"ak-fik-react" + (mine === "faydali" ? " on" : "")} disabled={!!mine} onClick={() => react(idea, "faydali")}>
                    <ThumbsUp size={13} /> Faydalı <b>{c.faydali}</b>
                  </button>
                  <button className={"ak-fik-react" + (mine === "katilmiyorum" ? " on" : "")} disabled={!!mine || (!mine && katilmiyorumLeft <= 0)} onClick={() => react(idea, "katilmiyorum")} title={katilmiyorumLeft <= 0 ? "Bugünkü katılmıyorum hakkın bitti" : ""}>
                    <ThumbsDown size={13} /> Katılmıyorum <b>{c.katilmiyorum}</b>
                  </button>
                  <button className="ak-fik-report" onClick={() => openReport(idea.id)}><Flag size={12} /> Bildir</button>
                </div>
              </article>
            );
          })
        )}
      </section>

      {reportFor && (
        <div className="ak-modal-veil" onClick={() => setReportFor(null)}>
          <div className="ak-modal ak-fik-report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ak-fik-report-head">
              <h3>Bildir</h3>
              <button className="ak-icon" onClick={() => setReportFor(null)}><X size={16} /></button>
            </div>
            <div className="ak-fik-report-reasons">
              {REPORT_REASONS.map(([k, l]) => (
                <button key={k} className={"ak-cchip" + (reportReason === k ? " on" : "")} onClick={() => setReportReason(k)}>{l}</button>
              ))}
            </div>
            <textarea className="ak-fik-report-note" placeholder="İstersen ek açıklama yaz (opsiyonel)" value={reportNote} onChange={(e) => setReportNote(e.target.value)} rows={3} />
            <button className="ak-btn ak-btn-primary" onClick={submitReport}>Gönder</button>
            {reportMsg && <p className="ak-fik-hint">{reportMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
