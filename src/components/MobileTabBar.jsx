// AK-081/C2: Mobil alt tab bar — yalnız ≤768px'de görünür (CSS medya sorgusu).
// TradingView modeli, bizim dilde: İzleme / Grafik / Keşfet / Topluluk / Menü.
// Keşfet = Home (Top Movers, öne çıkanlar). Grafik = Lab. Menü = üye ise Ben, değilse Giriş.
// AK-080 ilkesi: duvarlar tab İÇERİKLERİNDE, tab'ların kendisinde değil — hepsi tıklanır.
import { NavLink } from "react-router-dom";
import { Eye, CandlestickChart, Compass, Users, Menu } from "lucide-react";
import { useAuth } from "../lib/AuthProvider.jsx";

export default function MobileTabBar() {
  const { user, loading } = useAuth();
  const menuTarget = !loading && user ? "/ben" : "/giris";
  const tabs = [
    { to: "/izleme", label: "İzleme", Icon: Eye },
    { to: "/lab", label: "Grafik", Icon: CandlestickChart },
    { to: "/", label: "Keşfet", Icon: Compass, end: true },
    { to: "/topluluk", label: "Topluluk", Icon: Users },
    { to: menuTarget, label: "Menü", Icon: Menu },
  ];
  return (
    <nav className="ak-tabbar" aria-label="Ana gezinme">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink key={label} to={to} end={end} className={({ isActive }) => "ak-tab" + (isActive ? " on" : "")}>
          <Icon size={20} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
