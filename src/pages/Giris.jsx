import { useState } from "react";
import { KeyRound, Mail, Clock } from "lucide-react";
import AkLogo from "../components/AkLogo.jsx";
import "../styles/giris.css";

export default function Giris() {
  const [mode, setMode] = useState("kod"); // kod | bekleme
  const [done, setDone] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    const v = val.trim();
    if (!v) { setErr(mode === "kod" ? "Davet kodunu gir." : "E-posta adresini gir."); return; }
    if (mode === "bekleme" && !/^\S+@\S+\.\S+$/.test(v)) { setErr("Geçerli bir e-posta gir."); return; }
    if (mode === "kod" && v.length < 4) { setErr("Kod çok kısa görünüyor."); return; }
    setErr("");
    setDone(true); // backend (AK-006) bağlanana kadar yalnız yerel doğrulama
  }

  return (
    <div className="ak-giris">
      <div className="ak-giris-card">
        <AkLogo size={40} />
        <h1>Altınkulak'a katıl</h1>
        <p className="ak-giris-lead">Davetli erişim. Davet kodun varsa gir, yoksa bekleme listesine katıl.</p>

        <div className="ak-giris-tabs">
          <button className={mode === "kod" ? "on" : ""} onClick={() => { setMode("kod"); setDone(false); setVal(""); setErr(""); }}>Davet kodu</button>
          <button className={mode === "bekleme" ? "on" : ""} onClick={() => { setMode("bekleme"); setDone(false); setVal(""); setErr(""); }}>Bekleme listesi</button>
        </div>

        {done ? (
          <div className="ak-giris-done"><Clock size={20} /><p>{mode === "kod" ? "Kod doğrulandığında hesabın açılacak." : "Listeye eklendin. Sıran gelince e-posta göndereceğiz."}</p></div>
        ) : (
          <div className="ak-giris-form">
            {mode === "kod" ? (
              <div className="ak-in"><KeyRound size={16} /><input placeholder="Davet kodu (örn. AK-XXXX)" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            ) : (
              <div className="ak-in"><Mail size={16} /><input placeholder="E-posta adresin" type="email" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            )}
            <button className="ak-btn ak-btn-primary" onClick={submit}>{mode === "kod" ? "Doğrula & gir" : "Listeye katıl"}</button>
            {err && <p className="ak-giris-err">{err}</p>}
          </div>
        )}

        <p className="ak-giris-foot">Giriş & davet altyapısı backend ile bağlanacak (Supabase). Şimdilik arayüz hazır.</p>
      </div>
    </div>
  );
}
