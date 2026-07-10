import { useState } from "react";
import { KeyRound, Mail, Clock, Send } from "lucide-react";
import AkLogo from "../components/AkLogo.jsx";
import { signInWithEmail } from "../lib/supabase.js";
import "../styles/giris.css";

export default function Giris() {
  const [mode, setMode] = useState("kod"); // kod | bekleme | eposta
  const [done, setDone] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(m) { setMode(m); setDone(false); setVal(""); setErr(""); }

  async function submit() {
    const v = val.trim();
    if (!v) { setErr(mode === "kod" ? "Davet kodunu gir." : "E-posta adresini gir."); return; }
    if ((mode === "bekleme" || mode === "eposta") && !/^\S+@\S+\.\S+$/.test(v)) { setErr("Geçerli bir e-posta gir."); return; }
    if (mode === "kod" && v.length < 4) { setErr("Kod çok kısa görünüyor."); return; }
    setErr("");

    if (mode === "eposta") {
      setBusy(true);
      const { error } = await signInWithEmail(v);
      setBusy(false);
      if (error) { setErr(error.message); return; }
      setDone(true);
      return;
    }

    setDone(true); // kod/bekleme: backend (AK-006) bağlanana kadar yalnız yerel doğrulama
  }

  return (
    <div className="ak-giris">
      <div className="ak-giris-card">
        <AkLogo size={40} />
        <h1>Altınkulak'a katıl</h1>
        <p className="ak-giris-lead">Davetli erişim. Davet kodun varsa gir, e-posta ile giriş yap, ya da bekleme listesine katıl.</p>

        <div className="ak-giris-tabs">
          <button className={mode === "kod" ? "on" : ""} onClick={() => switchMode("kod")}>Davet kodu</button>
          <button className={mode === "eposta" ? "on" : ""} onClick={() => switchMode("eposta")}>E-posta ile giriş</button>
          <button className={mode === "bekleme" ? "on" : ""} onClick={() => switchMode("bekleme")}>Bekleme listesi</button>
        </div>

        {done ? (
          <div className="ak-giris-done">
            <Clock size={20} />
            <p>{mode === "kod" ? "Kod doğrulandığında hesabın açılacak." : mode === "eposta" ? "Sihirli link e-postana gönderildi — gelen kutunu kontrol et." : "Listeye eklendin. Sıran gelince e-posta göndereceğiz."}</p>
          </div>
        ) : (
          <div className="ak-giris-form">
            {mode === "kod" ? (
              <div className="ak-in"><KeyRound size={16} /><input placeholder="Davet kodu (örn. AK-XXXX)" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            ) : (
              <div className="ak-in"><Mail size={16} /><input placeholder="E-posta adresin" type="email" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            )}
            <button className="ak-btn ak-btn-primary" onClick={submit} disabled={busy}>
              {mode === "kod" ? "Doğrula & gir" : mode === "eposta" ? (busy ? "Gönderiliyor…" : <><Send size={15} /> Giriş linki gönder</>) : "Listeye katıl"}
            </button>
            {err && <p className="ak-giris-err">{err}</p>}
          </div>
        )}

        <p className="ak-giris-foot">Davet kodu & bekleme listesi backend ile bağlanacak (Supabase). E-posta ile giriş çalışır durumda.</p>
      </div>
    </div>
  );
}
