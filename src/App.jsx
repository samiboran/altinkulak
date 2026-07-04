import { Routes, Route, Outlet } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Tarama from "./pages/Tarama.jsx";
import Izleme from "./pages/Izleme.jsx";
import Lab from "./pages/Lab.jsx";
import Ogren from "./pages/Ogren.jsx";
import Topluluk from "./pages/Topluluk.jsx";
import Haberler from "./pages/Haberler.jsx";
import Ben from "./pages/Ben.jsx";
import Contributor from "./pages/Contributor.jsx";
import Fiyatlandirma from "./pages/Fiyatlandirma.jsx";
import Yasal from "./pages/Yasal.jsx";
import Giris from "./pages/Giris.jsx";
import Profil from "./pages/Profil.jsx";
import Ders from "./pages/Ders.jsx";

function Layout() {
  return (
    <>
      <Navbar />
      <main><Outlet /></main>
      <Footer />
    </>
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
      </Route>
    </Routes>
  );
}
