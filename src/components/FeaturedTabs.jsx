import { TABS } from "../lib/homeData.js";

export default function FeaturedTabs({ active, onChange }) {
  return (
    <div className="ak-tabs" role="tablist" aria-label="Seçili gruplar">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={"ak-tab" + (active === t.key ? " is-active" : "")}
          onClick={() => onChange(t.key)}
        >
          <span className="ak-tab-label">{t.label}</span>
          <span className="ak-tab-tag">{t.tag}</span>
        </button>
      ))}
    </div>
  );
}
