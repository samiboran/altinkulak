// AK-081/C3: Mobil üst hamburger — ikincil sayfalar. TradingView modeli:
// ana akış alttaki 5 tab'da (MobileTabBar), geri kalan her şey burada.
// Yalnız ≤860px'de görünür (masaüstünde .ak-nav zaten tam listeyi gösteriyor).
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, GraduationCap, Newspaper, Radar, CreditCard, Scale, Code2, Zap } from "lucide-react";

const ITEMS = [
  { to: "/ogren", label: "Eğitim", Icon: GraduationCap },
  { to: "/haberler", label: "Haberler", Icon: Newspaper },
  { to: "/tarama", label: "Tarama", Icon: Radar },
  { to: "/kod-editorum", label: "Kod Editörüm", Icon: Code2, soon: "deneysel" },
  { to: "/puanlar", label: "Kulak Puanı", Icon: Zap },
  { to: "/fiyatlandirma", label: "Fiyatlandırma", Icon: CreditCard },
  { to: "/yasal", label: "Yasal", Icon: Scale },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Rota değişince menü kapanır — kullanıcı seçim yaptı, perde çekilir.
  useEffect(() => { setOpen(false); }, [pathname]);
  // Menü açıkken arka plan kaymasın.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button className="ak-icon ak-burger" aria-label={open ? "Menüyü kapat" : "Menü"} aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <div className="ak-drawer-wrap" onClick={() => setOpen(false)}>
          <nav className="ak-drawer" aria-label="İkincil sayfalar" onClick={e => e.stopPropagation()}>
            {ITEMS.map(({ to, label, Icon, soon }) => (
              <Link key={to} to={to} className={"ak-drawer-item" + (pathname === to ? " on" : "")}>
                <Icon size={17} strokeWidth={1.8} /> {label}
                {soon && <span className="ak-soon">{soon}</span>}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
