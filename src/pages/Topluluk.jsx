import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Trophy, GitFork, ShieldCheck, AlertTriangle, Info, X, Award, Briefcase, Hash } from "lucide-react";
import { STRATEGIES, edgeScore, MEMBERS, focusLabel } from "../lib/communityData.js";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import "../styles/topluluk.css";

export default function Topluluk() {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const [sortBy, setSortBy] = useState("edge"); // "edge" | "win"
  const [member, setMember] = useState(null);    // üye kartı modalı (handle)

  // AK-080 C4: rütbe/t-stat tabloda herkese açık kalır — yalnız DETAYA inmek (üye kartı ->
  // profil) login gerektirir. Merak kancası: liste açık, tıklama login modalını tetikler.
  function openMember(u) {
    if (!user) { requireAuth("Profilleri görmek için giriş yap."); return; }
    setMember(u);
  }

  const rows = useMemo(() => {
    const withScore = STRATEGIES.map(s => ({ ...s, score: edgeScore(s) }));
    const key = sortBy === "edge" ? "score" : "win";
    return [...withScore].sort((a, b) => b[key] - a[key]);
  }, [sortBy]);

  return (
    <div className="ak-comm">
      <div className="ak-comm-head">
        <span className="ak-eyebrow">TOPLULUK · LİDER TABLOSU</span>
        <h1>Sinyali bulanlar üste çıksın.</h1>
        <p className="ak-demo-note">Aşağıdaki kullanıcılar ve istatistikler <b>eğitim amaçlı örnek senaryolardır</b> — gerçek kullanıcı verisi değildir. Üyelik (AK-006) açıldığında bu tablo gerçek, doğrulanmış sicillerden beslenecek.</p>
        <p className="lead">
          Burada sıralama kazanç oranına göre değil, <b>doğrulanmış edge’e</b> göre. Out-of-sample t-istatistiği ve yeterli örnek sayısı kazandırır. Pump yok, kanıt var.
        </p>
      </div>

      <div className="ak-sort">
        <span>Sırala:</span>
        <div className="ak-sortbtns">
          <button className={sortBy==="edge"?"on":""} onClick={()=>setSortBy("edge")}>Edge Skoru</button>
          <button className={sortBy==="win"?"on":""} onClick={()=>setSortBy("win")}>Kazanç oranı</button>
        </div>
        {sortBy==="win" && (
          <span className="ak-warn"><AlertTriangle size={13}/> Naif sıralama: yüksek kazanç oranlı ama istatistiksel olarak çürük stratejiler yukarı fırlar.</span>
        )}
      </div>

      <div className="ak-board">
        <div className="ak-board-h">
          <span>#</span><span>Trader</span><span>Sembol · Setup</span>
          <span>Kazanç</span><span>OOS</span><span>t-stat</span><span>Edge Skoru</span><span>Fork</span>
        </div>
        {rows.map((s, i) => {
          const good = s.t >= 2 && s.oos >= 20;
          return (
            <div className={"ak-board-r" + (s.trap ? " is-trap" : "")} key={s.user}>
              <span className="rk">{i + 1}</span>
              <button className="tr aslink" onClick={() => openMember(s.user)}>@{s.user}</button>
              <span className="sy">{s.sym} · {s.setup} · 1:{s.rr}</span>
              <span className="wn">{s.win}%</span>
              <span className="oo">{s.oos}</span>
              <span className={"ts " + (s.t >= 2 ? "ok" : "lo")}>{s.t.toFixed(1)}</span>
              <span className="sc">
                <b>{s.score}</b>
                {good ? <ShieldCheck size={13} className="i-ok"/> : <AlertTriangle size={13} className="i-warn"/>}
              </span>
              <span className="fk"><GitFork size={12}/> {s.forks}</span>
            </div>
          );
        })}
      </div>

      <div className="ak-explain">
        <Info size={15}/>
        <div>
          <b>Edge Skoru nasıl hesaplanır?</b> <code>clamp(t, 0, 6) / 6 × 100 × güven</code>, güven = <code>min(1, OOS/30)</code>.
          Yüksek kazanç oranı tek başına puan getirmez; <b>istatistiksel anlamlılık + yeterli örnek</b> getirir. @pumpkral %78 kazanıyor ama 9 işlem ve t=1.2 ile rastgeleden ayırt edilemez — o yüzden dipte.
        </div>
      </div>

      {/* Üye kartı — kısa performans görünümü */}
      {member && MEMBERS[member] && (() => { const m = MEMBERS[member]; return (
        <div className="ak-modal-veil" onClick={() => setMember(null)}>
          <div className="ak-member" onClick={(e) => e.stopPropagation()}>
            <button className="ak-member-x" onClick={() => setMember(null)}><X size={16} /></button>
            <div className="ak-member-top">
              <span className="hn">@{member}</span>
              <span className="no"><Hash size={12} />{m.memberNo}. üye</span>
            </div>
            <div className="ak-member-ranks">
              <span className="rb edge"><Award size={13} /> Edge: <b>{m.edge}</b></span>
              <span className="rb contrib">Katkı: <b>{m.contrib}</b></span>
            </div>
            {m.job && <div className="ak-member-job"><Briefcase size={13} /> {m.job}</div>}
            <div className="ak-member-stats">
              <div><b>{m.n}</b><span>işlem</span></div>
              <div><b>%{m.hit}</b><span>isabet</span></div>
              <div><b className={m.totalR >= 0 ? "pos" : "neg"}>{m.totalR >= 0 ? "+" : ""}{m.totalR}R</b><span>toplam</span></div>
            </div>
            {m.n < 30 && <p className="ak-member-warn"><AlertTriangle size={12} /> {m.n} işlem — örnek az, isabet oranı henüz anlamsız.</p>}
            <div className="ak-member-focus">{focusLabel(m.focus)} · {Object.entries(m.focus).filter(([,v]) => v > 0).map(([k, v]) => `${k} %${v}`).join(" · ")}</div>
            <Link className="ak-member-link" to={`/u/${member}`} onClick={() => setMember(null)}>Profili gör →</Link>
          </div>
        </div>
      ); })()}
    </div>
  );
}
