import { NavLink, Link } from "react-router-dom";
import { Search, Bell } from "lucide-react";
import AkLogo from "./AkLogo.jsx";

export default function Navbar() {
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
      </nav>
      <div className="ak-tools">
        <button className="ak-icon" aria-label="Ara"><Search size={18} /></button>
        <button className="ak-icon" aria-label="Bildirimler"><Bell size={18} /></button>
        <Link className="ak-signin" to="/giris">Giriş</Link>
      </div>
    </header>
  );
}
