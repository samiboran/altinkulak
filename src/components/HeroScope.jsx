import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PlayCircle } from "lucide-react";
import { buildWave, TIP_Y } from "../lib/homeData.js";

export default function HeroScope({ hero }) {
  const wave = useMemo(buildWave, []);
  return (
    <section className="ak-hero">
      <svg className="ak-scope" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="ak-sig" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3E5C58" />
            <stop offset="46%" stopColor="#5E9A8C" />
            <stop offset="76%" stopColor="#B79A57" />
            <stop offset="100%" stopColor="#F1C97A" />
          </linearGradient>
          <filter id="ak-glow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={i} className="ak-scope-grid" x1={i * 100} y1="0" x2={i * 100} y2="200" />
        ))}
        <line className="ak-base" x1="0" y1="100" x2="1000" y2="100" />
        <path className="ak-wave" d={wave} stroke="url(#ak-sig)" filter="url(#ak-glow)" />
        <circle className="ak-tip" cx="1000" cy={TIP_Y} r="4.5" />
      </svg>

      <div className="ak-hero-copy">
        <span className="ak-eyebrow">SİNYAL / GÜRÜLTÜ</span>
        <h1 className="ak-h1">{hero.h}</h1>
        <p className="ak-sub">{hero.s}</p>
        <div className="ak-cta">
          <Link className="ak-btn ak-btn-primary" to="/lab">Stratejini test et <ChevronRight size={16} /></Link>
          <Link className="ak-btn ak-btn-ghost" to="/ogren"><PlayCircle size={16} /> İzle &amp; uygula</Link>
        </div>
      </div>
    </section>
  );
}
