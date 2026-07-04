import { Link } from "react-router-dom";
import AkLogo from "./AkLogo.jsx";

export default function Footer() {
  return (
    <footer className="ak-foot">
      <span className="ak-word small" style={{display:"inline-flex",alignItems:"center",gap:"7px"}}><AkLogo size={20}/> altın<span>kulak</span></span>
      <p className="ak-risk">
        Eğitim ve simülasyon amaçlıdır; yatırım danışmanlığı değildir. Geçmiş performans geleceği garanti etmez.
      </p>
      <Link className="ak-risk" to="/yasal" style={{ marginLeft: "auto", color: "var(--gold)" }}>Yasal &amp; Riziko →</Link>
    </footer>
  );
}
