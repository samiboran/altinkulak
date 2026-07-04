import { Link } from "react-router-dom";
import { Play, FlaskConical } from "lucide-react";
import { LESSONS } from "../lib/lessons.js";
import LabEmbed from "../components/LabEmbed.jsx";
import "../styles/ogren.css";

export default function Ogren() {
  const featured = LESSONS.find((l) => l.slug === "fvg-nedir") || LESSONS[0];
  return (
    <div className="ak-ogren">
      <div className="ak-ogren-head">
        <span className="ak-eyebrow">EĞİTİM · İZLE & UYGULA</span>
        <h1 style={{ fontFamily: "'Chakra Petch'", fontSize: "clamp(24px,3vw,34px)", margin: "10px 0 6px" }}>
          İzlerken uygula, gerçekten öğren.
        </h1>
        <p className="lead" style={{ color: "var(--muted)", maxWidth: 640, margin: 0 }}>
          Ders bir yanda oynar, strateji öbür yanda canlı. Eğitmen “şimdi FVG’yi işaretliyoruz” derken sen kendi panelinde aynısını yaparsın.
        </p>
      </div>

      <div className="ak-split">
        <Link to={`/ders/${featured.slug}`} className="ak-video" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="ak-video-frame"><div className="play"><Play size={26} /></div></div>
          <div className="ak-video-meta">
            <h3>{featured.n} · {featured.title}</h3>
            <p>{featured.summary} — {featured.dur}</p>
          </div>
        </Link>

        <div className="ak-apply">
          <h2><FlaskConical size={16} /> Canlı uygula</h2>
          <p className="hint">Videodaki adımı kendi panelinde dene.</p>
          <LabEmbed symbol="SOL" rr={2} />
        </div>
      </div>

      <div className="ak-track">
        <h2>Kit: Sıfırdan Başla</h2>
        <div className="ak-lessons">
          {LESSONS.map((l) => (
            <Link className="ak-lesson" key={l.slug} to={`/ders/${l.slug}`}>
              <span className="num">{l.n}</span>
              <span className="info"><b>{l.title}</b><span>{l.summary}</span></span>
              <span className="dur">{l.dur}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
