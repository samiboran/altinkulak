import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Play, Newspaper, Cpu, Sparkles, Clock } from "lucide-react";
import { PIYASA_VIDEO, AI_FINANS, TEKNOLOJI } from "../lib/newsData.js";
import "../styles/haberler.css";

const TABS = [
  { key: "piyasa", label: "Videolu Piyasa", icon: Play },
  { key: "finans", label: "AI & Finans", icon: Newspaper },
  { key: "teknoloji", label: "Teknoloji", icon: Cpu },
];

function ArticleFeed({ items }) {
  return (
    <div className="hb-feed">
      {items.map((a, i) => (
        <article className="hb-art" key={i}>
          <div className="hb-art-top">
            <span className="hb-tag">{a.tag}</span>
            <span className="hb-meta"><Clock size={12} /> {a.time} · {a.src}</span>
          </div>
          <h3>{a.t}</h3>
          <p className="hb-sum"><span className="hb-ai"><Sparkles size={12} /> AI özet</span> {a.sum}</p>
        </article>
      ))}
    </div>
  );
}

export default function Haberler() {
  const loc = useLocation();
  const [tab, setTab] = useState("piyasa");
  useEffect(() => {
    const h = loc.hash.replace("#", "");
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, [loc.hash]);

  return (
    <div className="hb">
      <div className="hb-head">
        <span className="ak-eyebrow">AI & HABER</span>
        <h1>Haberi yapay zekâ süzsün.</h1>
        <p className="lead">Finans ve teknoloji akışı, AI ile özetlenerek. Önemliyi gürültüden ayır.</p>
      </div>

      <div className="hb-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={"hb-tab" + (tab === t.key ? " on" : "")} onClick={() => setTab(t.key)}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "piyasa" && (
        <div className="hb-vgrid">
          {PIYASA_VIDEO.map((v, i) => (
            <article className="hb-vid" key={i}>
              <div className="hb-thumb"><div className="hb-play"><Play size={20} /></div><span className="hb-dur">{v.dur}</span></div>
              <div className="hb-vmeta">
                <span className="hb-vtag">{v.tag} · {v.m}</span>
                <h3>{v.t}</h3>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "finans" && <ArticleFeed items={AI_FINANS} />}
      {tab === "teknoloji" && <ArticleFeed items={TEKNOLOJI} />}

      <p className="hb-note">Örnek içerik. Gerçek besleme ve AI özetleme kaynağa bağlanınca canlı gelecek.</p>
    </div>
  );
}
