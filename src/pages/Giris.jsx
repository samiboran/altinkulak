import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Mail, Clock, Send, Hash } from "lucide-react";
import AkLogo from "../components/AkLogo.jsx";
import { signInWithEmail, verifyEmailOtp, verifyInviteCode, redeemInviteCode, joinWaitlist } from "../lib/supabase.js";
import "../styles/giris.css";

export default function Giris() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("kod"); // kod | bekleme | eposta
  // AK-080: "kod" modu iki adımlı — önce kod doğrulanır (inviteId saklanır), sonra e-posta
  // girilip OTP gönderilir; kullanıcı gerçek uid'i ancak OTP doğrulanınca doğar, o yüzden
  // invite'ın used_by'ı OTP doğrulama anında (submitOtp) işaretlenir, kod adımında değil.
  const [codeStep, setCodeStep] = useState("code"); // code | email
  const [inviteId, setInviteId] = useState(null);
  const [done, setDone] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");

  function switchMode(m) { setMode(m); setDone(false); setVal(""); setErr(""); setOtp(""); setCodeStep("code"); setInviteId(null); }

  async function submitOtp() {
    const t = otp.trim();
    if (!/^\d{6}$/.test(t)) { setErr("Maildeki 6 haneli kodu gir."); return; }
    setErr("");
    setBusy(true);
    const { data, error } = await verifyEmailOtp(sentTo, t);
    if (error) { setBusy(false); setErr("Kod doğrulanamadı — süresi dolmuş olabilir, yeni link iste."); return; }
    const uid = data?.session?.user?.id || data?.user?.id;
    if (inviteId && uid) await redeemInviteCode(inviteId, uid);
    setBusy(false);
    navigate("/ben"); // oturum bu tarayıcıda açıldı, kalıcıdır
  }

  async function submit() {
    const v = val.trim();

    if (mode === "bekleme") {
      if (!/^\S+@\S+\.\S+$/.test(v)) { setErr("Geçerli bir e-posta gir."); return; }
      setErr(""); setBusy(true);
      const { ok } = await joinWaitlist(v);
      setBusy(false);
      if (!ok) { setErr("Bir şeyler ters gitti, tekrar dene."); return; }
      setDone(true);
      return;
    }

    if (mode === "kod" && codeStep === "code") {
      if (v.length < 4) { setErr("Kod çok kısa görünüyor."); return; }
      setErr(""); setBusy(true);
      const res = await verifyInviteCode(v);
      setBusy(false);
      if (!res.valid) { setErr(res.error); return; }
      setInviteId(res.inviteId);
      setCodeStep("email");
      setVal("");
      return;
    }

    // buradan sonrası: mode === "eposta", ya da mode === "kod" && codeStep === "email"
    if (!v) { setErr("E-posta adresini gir."); return; }
    if (!/^\S+@\S+\.\S+$/.test(v)) { setErr("Geçerli bir e-posta gir."); return; }
    setErr(""); setBusy(true);
    const { error } = await signInWithEmail(v);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSentTo(v);
    setDone(true);
  }

  const awaitingEmail = mode === "eposta" || (mode === "kod" && codeStep === "email");

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
            <p>{mode === "bekleme" ? "Listeye eklendin. Sıran gelince e-posta göndereceğiz." : "E-postana bir giriş linki ve 6 haneli kod gönderildi."}</p>
            {awaitingEmail && (
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
            {mode === "kod" && codeStep === "code" && (
              <div className="ak-in"><KeyRound size={16} /><input placeholder="Davet kodu (örn. AK-XXXX)" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            )}
            {(mode === "eposta" || (mode === "kod" && codeStep === "email")) && (
              <div className="ak-in"><Mail size={16} /><input placeholder="E-posta adresin" type="email" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            )}
            {mode === "bekleme" && (
              <div className="ak-in"><Mail size={16} /><input placeholder="E-posta adresin" type="email" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} /></div>
            )}
            <button className="ak-btn ak-btn-primary" onClick={submit} disabled={busy}>
              {mode === "kod" && codeStep === "code" ? (busy ? "Doğrulanıyor…" : "Kodu doğrula")
                : mode === "bekleme" ? (busy ? "Ekleniyor…" : "Listeye katıl")
                : (busy ? "Gönderiliyor…" : <><Send size={15} /> Giriş linki gönder</>)}
            </button>
            {err && <p className="ak-giris-err">{err}</p>}
          </div>
        )}

      </div>
    </div>
  );
}
