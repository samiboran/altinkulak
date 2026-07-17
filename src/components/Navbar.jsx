import { useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Search, User, LogOut, ChevronDown } from "lucide-react";
import AkLogo from "./AkLogo.jsx";
import MobileMenu from "./MobileMenu.jsx";
import { useAuth } from "../lib/AuthProvider.jsx";
import { signOut } from "../lib/supabase.js";

// AK-080 C5: guest sadeleştirme (TradingView modeli) — 4 ana kalem, geri kalanı "Daha fazla" altında.
// /lab zaten grafik sayfası ("Lab" etiketi kafa karıştırıyordu -> "Grafik"); /kod-editorum kısaca "Lab".
const MORE_LINKS = [
  { to: "/tarama", label: "Tarama" },
  { to: "/izleme", label: "İzleme" },
  { to: "/ogren", label: "Eğitim" },
  { to: "/haberler", label: "Haberler" },
  { to: "/puanlar", label: "Kulak Puanı" },
  { to: "/fiyatlandirma", label: "Fiyatlandırma" },
];

export default function Navbar() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const handle = user?.email ? user.email.split("@")[0] : "";

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate("/");
  }

  return (
    <header className="ak-top">
      <MobileMenu />
      <Link className="ak-brand" to="/">
        <AkLogo size={30} />
        <span className="ak-word">altın<span>kulak</span></span>
      </Link>
      <nav className="ak-nav">
        <NavLink to="/lab">Grafik</NavLink>
        <NavLink to="/topluluk">Topluluk</NavLink>
        <NavLink to="/kod-editorum">Lab</NavLink>
        <div className="ak-navmore">
          <button className="ak-navmore-btn" onClick={() => setMoreOpen((v) => !v)}>
            Daha fazla <ChevronDown size={13} />
          </button>
          {moreOpen && (
            <div className="ak-navmore-pop">
              {MORE_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={() => setMoreOpen(false)}>{l.label}</NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>
      <div className="ak-tools">
        {/* AK-082/C2: Ara → Tarama; zil kaldırıldı (bildirim sistemi gelene dek). */}
        <button className="ak-icon" aria-label="Ara" onClick={() => navigate("/tarama")}><Search size={18} /></button>
        {!loading && user ? (
          <>
            <Link className="ak-signin" to="/ben">Ben</Link>
            <div className="ak-usermenu">
              <button className="ak-userbtn" onClick={() => setOpen((v) => !v)}><User size={14} /> @{handle}</button>
              {open && (
                <div className="ak-usermenu-pop">
                  <button onClick={handleSignOut}><LogOut size={14} /> Çıkış yap</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link className="ak-signin" to="/giris">Giriş Yap</Link>
        )}
      </div>
    </header>
  );
}
