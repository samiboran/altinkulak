import { useParams, Link } from "react-router-dom";
import { Play, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getLesson, LESSONS } from "../lib/lessons.js";
import LabEmbed from "../components/LabEmbed.jsx";
import "../styles/ogren.css";
import "../styles/ders.css";

export default function Ders() {
  const { slug } = useParams();
  const lesson = getLesson(slug);
  if (!lesson) {
    return <div className="ak-page"><h1>Ders bulunamadı</h1>
      <p className="lead">Bu ders mevcut değil. <Link to="/ogren" style={{color:"var(--gold)"}}>Eğitime dön →</Link></p></div>;
  }
  const idx = LESSONS.findIndex((l) => l.slug === slug);
  const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];

  return (
    <div className="ak-ders">
      <Link to="/ogren" className="ak-back"><ChevronLeft size={15}/> Sıfırdan Başla kiti</Link>
      <span className="ak-eyebrow">DERS {lesson.n}</span>
      <h1>{lesson.title}</h1>
      <p className="ak-ders-sum">{lesson.summary}</p>

      <div className="ak-ders-grid">
        <div className="ak-ders-main">
          <div className="ak-video-frame ak-ders-video"><div className="play"><Play size={26}/></div>
            <span className="ak-dur-tag">{lesson.dur}</span>
          </div>
          {lesson.sections.map((s, i) => (
            <section className="ak-ders-sec" key={i}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </section>
          ))}
          <div className="ak-takeaways">
            <h3>Anahtar çıkarımlar</h3>
            {lesson.takeaways.map((t, i) => (
              <div className="ak-take" key={i}><Check size={15}/> <span>{t}</span></div>
            ))}
          </div>
        </div>

        <aside className="ak-ders-side">
          {lesson.apply ? (
            <div className="ak-apply">
              <h2>Şimdi uygula</h2>
              <p className="hint">Dersteki kurulumu kendi verinde test et.</p>
              <LabEmbed symbol={lesson.apply.symbol} rr={lesson.apply.rr} />
            </div>
          ) : (
            <div className="ak-apply">
              <h2>Bu derste pratik yok</h2>
              <p className="hint">Temel kavram dersi. Uygulamalı test 03. dersten itibaren başlıyor.</p>
            </div>
          )}
          <div className="ak-ders-nav">
            {prev ? <Link to={`/ders/${prev.slug}`} className="ak-btn ak-btn-ghost"><ChevronLeft size={15}/> Önceki</Link> : <span/>}
            {next ? <Link to={`/ders/${next.slug}`} className="ak-btn ak-btn-primary">Sonraki <ChevronRight size={15}/></Link> : <span/>}
          </div>
        </aside>
      </div>
    </div>
  );
}
