import { useState } from "react";
import { KeyRound, Mail, Clock } from "lucide-react";
import AkLogo from "../components/AkLogo.jsx";
import "../styles/giris.css";

export default function Giris() {
  const [mode, setMode] = useState("kod"); // kod | bekleme
  const [done, setDone] = useState(false);

  return (
    <div className="ak-giris">
      <div className="ak-giris-card">
        <AkLogo size={40} />
        <h1>Altınkulak'a katıl</h1>
        <p className="ak-giris-lead">Davetli erişim. Davet kodun varsa gir, yoksa bekleme listesine katıl.</p>

        <div className="ak-giris-tabs">
          <button className={mode === "kod" ? "on" : ""} onClick={() => { setMode("kod"); setDone(false); }}>Davet kodu</button>
          <button className={mode === "bekleme" ? "on" : ""} onClick={() => { setMode("bekleme"); setDone(false); }}>Bekleme listesi</button>
        </div>

        {done ? (
          <div className="ak-giris-done"><Clock size={20} /><p>{mode === "kod" ? "Kod doğrulandığında hesabın açılacak." : "Listeye eklendin. Sıran gelince e-posta göndereceğiz."}</p></div>
        ) : (
          <div className="ak-giris-form">
            {mode === "kod" ? (
              <div className="ak-in"><KeyRound size={16} /><input placeholder="Davet kodu (örn. AK-XXXX)" /></div>
            ) : (
              <div className="ak-in"><Mail size={16} /><input placeholder="E-posta adresin" type="email" /></div>
            )}
            <button className="ak-btn ak-btn-primary" onClick={() => setDone(true)}>{mode === "kod" ? "Doğrula & gir" : "Listeye katıl"}</button>
          </div>
        )}

        <p className="ak-giris-foot">Giriş & davet altyapısı backend ile bağlanacak (Supabase). Şimdilik arayüz hazır.</p>
      </div>
    </div>
  );
}
