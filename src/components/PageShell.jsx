// Tekrar kullanilabilir taslak sayfa duzeni (stub sayfalar icin).
export default function PageShell({ eyebrow, title, lead, items = [] }) {
  return (
    <div className="ak-page">
      {eyebrow && <span className="ak-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      {items.length > 0 && (
        <div className="ak-stub">
          {items.map((it, i) => (
            <div className="ak-stub-item" key={i}>
              <h3>{it.t} {it.soon && <span className="ak-soon">Yakında</span>}</h3>
              <p>{it.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
