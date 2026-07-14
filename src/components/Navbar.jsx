import { useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Search, Bell, User, LogOut } from "lucide-react";
import AkLogo from "./AkLogo.jsx";
import { useAuth } from "../lib/AuthProvider.jsx";
import { signOut } from "../lib/supabase.js";

export default function Navbar() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const handle = user?.email ? user.email.split("@")[0] : "";

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate("/");
  }

  return (
    <header className="ak-top">
      <Link className="ak-brand" to="/">
        <AkLogo size={30} />
        <span className="ak-word">altın<span>kulak</span></span>
      </Link>
      <nav className="ak-nav">
        <NavLink to="/lab">Lab</NavLink>
        <NavLink to="/tarama">Tarama</NavLink>
        <NavLink to="/izleme">İzleme</NavLink>
        <NavLink to="/ogren">Eğitim</NavLink>
        <NavLink to="/topluluk">Topluluk</NavLink>
        <NavLink to="/haberler">Haberler</NavLink>
        <NavLink to="/fiyatlandirma">Fiyatlandırma</NavLink>
        <NavLink to="/kod-editorum">Kod Editörüm <span className="ak-soon">deneysel</span></NavLink>
      </nav>
      <div className="ak-tools">
        <button className="ak-icon" aria-label="Ara"><Search size={18} /></button>
        <button className="ak-icon" aria-label="Bildirimler"><Bell size={18} /></button>
        {!loading && user ? (
          <div className="ak-usermenu">
            <button className="ak-signin ak-userbtn" onClick={() => setOpen(v => !v)}><User size={14} /> @{handle}</button>
            {open && (
              <div className="ak-usermenu-pop">
                <button onClick={handleSignOut}><LogOut size={14} /> Çıkış yap</button>
              </div>
            )}
          </div>
        ) : (
          <Link className="ak-signin" to="/giris">Giriş</Link>
        )}
      </div>
    </header>
  );
}
