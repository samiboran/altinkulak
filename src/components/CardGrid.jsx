import { Link } from "react-router-dom";
import { PlayCircle, Newspaper, Cpu, FlaskConical, GraduationCap, Users } from "lucide-react";
import { CARDS } from "../lib/homeData.js";

const ICONS = { PlayCircle, Newspaper, Cpu, FlaskConical, GraduationCap, Users };

export default function CardGrid() {
  return (
    <section className="ak-grid">
      {CARDS.map(({ n, icon, title, desc, chip, to }) => {
        const Icon = ICONS[icon];
        return (
          <Link key={n} to={to} className="ak-card">
            <span className="ak-card-n">{n}</span>
            <span className="ak-card-ic">{Icon && <Icon size={22} />}</span>
            <span className="ak-card-body">
              <span className="ak-card-title">{title}{chip && <em className="ak-chip">{chip}</em>}</span>
              <span className="ak-card-desc">{desc}</span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
