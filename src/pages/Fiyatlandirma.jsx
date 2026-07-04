import { Check, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import "../styles/fiyat.css";

const TIERS = [
  {
    name: "Ücretsiz", price: "₺0", per: "sonsuza dek", cta: "Hemen başla", to: "/giris", featured: false,
    feats: ["Gecikmeli piyasa verisi (BIST/ABD/kripto)", "Backtest motoru + dürüstlük yargısı", "Tüm eğitim içeriği", "Topluluk + leaderboard", "Kişisel işlem günlüğü", "Portföy takibi"],
  },
  {
    name: "Pro", price: "₺149", per: "/ay", cta: "Pro'ya geç", to: "/giris", featured: true,
    feats: ["Ücretsiz'deki her şey", "Gerçek-zamanlı veri", "Edge Tarayıcı — sınırsız", "AI haber özeti + mentor", "Sınırsız kayıtlı strateji & playbook", "Monte Carlo + gelişmiş metrikler", "Öncelikli destek"],
  },
  {
    name: "Katkıcı", price: "Gelir paylaşımı", per: "", cta: "Başvur", to: "/contributor", featured: false,
    feats: ["Pro'daki her şey", "Doğrulanmış eğitmen rozeti", "Canlı eğitim seansları aç", "Premium içerik sat", "Gelir paylaşımı modeli"],
  },
];

export default function Fiyatlandirma() {
  return (
    <div className="ak-fiyat">
      <span className="ak-eyebrow">FİYATLANDIRMA</span>
      <h1>Dürüstlük ücretsiz. Hız ve AI Pro.</h1>
      <p className="ak-fiyat-lead">Çekirdek — istatistiksel backtest, eğitim, topluluk — herkese açık. Gecikmeli veriyle çalıştığımız için ücretsiz katman gerçekten ücretsiz kalıyor. Gerçek-zamanlı veri ve AI isteyenler Pro.</p>

      <div className="ak-tiers">
        {TIERS.map(t => (
          <div className={"ak-tier" + (t.featured ? " featured" : "")} key={t.name}>
            {t.featured && <span className="ak-tier-badge">En popüler</span>}
            <h2>{t.name}</h2>
            <div className="ak-tier-price">{t.price}<span>{t.per}</span></div>
            <Link className={"ak-btn " + (t.featured ? "ak-btn-primary" : "ak-btn-secondary")} to={t.to}>{t.cta}</Link>
            <ul>{t.feats.map((f, i) => <li key={i}><Check size={15} /> {f}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="ak-fiyat-note">
        <ShieldCheck size={16} />
        <p>Altınkulak eğitim ve simülasyon platformudur; yatırım danışmanlığı değildir. Gösterilen tüm sonuçlar geçmiş/sentetik veriye dayanır ve gelecek performans garantisi vermez.</p>
      </div>
    </div>
  );
}
