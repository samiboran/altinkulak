import { lazy, Suspense } from "react";
import { Routes, Route, Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import TickerStrip from "./components/TickerStrip.jsx";
import Home from "./pages/Home.jsx";
import { AuthProvider } from "./lib/AuthProvider.jsx";

// AK-022: route lazy-load — ilk boyama hızı için yalnız Home + kabuk peşin yüklenir.
// Hedef: girişsiz kullanıcı fiyatı <1sn görsün (TradingView hızlı-bakış trafiği).
const Lab = lazy(() => import("./pages/Lab.jsx"));
const Tarama = lazy(() => import("./pages/Tarama.jsx"));
const Izleme = lazy(() => import("./pages/Izleme.jsx"));
const Ogren = lazy(() => import("./pages/Ogren.jsx"));
const Topluluk = lazy(() => import("./pages/Topluluk.jsx"));
const Haberler = lazy(() => import("./pages/Haberler.jsx"));
const Ben = lazy(() => import("./pages/Ben.jsx"));
const Contributor = lazy(() => import("./pages/Contributor.jsx"));
const Fiyatlandirma = lazy(() => import("./pages/Fiyatlandirma.jsx"));
const Yasal = lazy(() => import("./pages/Yasal.jsx"));
const Giris = lazy(() => import("./pages/Giris.jsx"));
const Profil = lazy(() => import("./pages/Profil.jsx"));
const Ders = lazy(() => import("./pages/Ders.jsx"));
const KodEditoru = lazy(() => import("./pages/KodEditoru.jsx"));

// AK-060: kayan sembol seridi yalnizca izleme agirlikli sayfalarda gorunur
const TICKER_PATHS = ["/lab", "/izleme"];

function Layout() {
  const { pathname } = useLocation();
  return (
    <AuthProvider>
      <Navbar />
      {TICKER_PATHS.includes(pathname) && <TickerStrip />}
      <main>
        <Suspense fallback={<div className="ak-pageload" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/tarama" element={<Tarama />} />
        <Route path="/izleme" element={<Izleme />} />
        <Route path="/ogren" element={<Ogren />} />
        <Route path="/topluluk" element={<Topluluk />} />
        <Route path="/haberler" element={<Haberler />} />
        <Route path="/ben" element={<Ben />} />
        <Route path="/contributor" element={<Contributor />} />
        <Route path="/fiyatlandirma" element={<Fiyatlandirma />} />
        <Route path="/yasal" element={<Yasal />} />
        <Route path="/giris" element={<Giris />} />
        <Route path="/u/:handle" element={<Profil />} />
        <Route path="/ders/:slug" element={<Ders />} />
        <Route path="/kod-editorum" element={<KodEditoru />} />
      </Route>
    </Routes>
  );
}
