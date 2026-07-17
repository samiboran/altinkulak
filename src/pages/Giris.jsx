import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Mail, Clock, Send, Hash } from "lucide-react";
import AkLogo from "../components/AkLogo.jsx";
import { signInWithEmail, verifyEmailOtp } from "../lib/supabase.js";
import "../styles/giris.css";

export default function Giris() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("kod"); // kod | bekleme | eposta
  const [done, setDone] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // AK-081/C1: linke tıklamak yerine maildeki 6 haneli kodu BURADA girme yolu —
  // link mail uygulamasının iç tarayıcısında açılınca oturum yanlış tarayıcıda kalıyordu.
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");

  function switchMode(m) { setMode(m); setDone(false); setVal(""); setErr(""); setOtp(""); }

  async function submitOtp() {
    const t = otp.trim();
    if (!/^\d{6}$/.test(t)) { setErr("Maildeki 6 haneli kodu gir."); return; }
    setErr("");
    setBusy(true);
    const { error } = await verifyEmailOtp(sentTo, t);
    setBusy(false);
    if (error) { setErr("Kod doğrulanamadı — süresi dolmuş olabilir, yeni link iste."); return; }
    navigate("/ben"); // oturum bu tarayıcıda açıldı, kalıcıdır
  }

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
      setSentTo(v);
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
            <p>{mode === "kod" ? "Kod doğrulandığında hesabın açılacak." : mode === "eposta" ? "E-postana bir giriş linki ve 6 haneli kod gönderildi." : "Listeye eklendin. Sıran gelince e-posta göndereceğiz."}</p>
            {mode === "eposta" && (
              <div className="ak-giris-form" style={{ marginTop: 12 }}>
                <div className="ak-in"><Hash size={16} /><input placeholder="Maildeki 6 haneli kod" inputMode="numeric" maxLength={6} value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setErr(""); }} /></div>
                <button className="ak-btn ak-btn-primary" onClick={submitOtp} disabled={busy}>{busy ? "Doğrulanıyor…" : "Kodla giriş yap"}</button>
                <p className="ak-giris-foot" style={{ marginTop: 6 }}>Linke tıklamak yerine kodu burada girmen önerilir — böylece oturum bu tarayıcıda açılır ve kalıcı olur.</p>
                {err && <p className="ak-giris-err">{err}</p>}
              </div>
            )}
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
