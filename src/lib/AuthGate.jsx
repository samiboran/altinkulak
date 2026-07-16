import { createContext, useContext, useState } from "react";
import { Lock, Mail, Send, Clock } from "lucide-react";
import { useAuth } from "./AuthProvider.jsx";
import { signInWithEmail } from "./supabase.js";
import "../styles/authgate.css";

// AK-080 C6: tek merkezi login duvarı. Her bileşen kendi if-else'ini yazmaz — kilitli bir
// aksiyon requireAuth(reason) çağırır: kullanıcı girişliyse true döner (aksiyon devam eder),
// değilse modalı açar ve false döner (çağıran taraf işlemi durdurur). Modal engel değil nudge:
// sayfa yönlendirmesi yok, akış kopmuyor (D — AK-080 ilkesi).
//
// Sağlam varsayılan: Provider olmadan (ör. SSR duman testi tests/render.jsx her sayfayı yalnız
// başına render eder) useAuthGate() çökmemeli — AuthProvider'ın createContext(default) örüntüsüyle
// aynı: gerçek bir Provider yoksa requireAuth sessizce false döner, modal açmaz.
const AuthGateContext = createContext({ requireAuth: () => false });

export function useAuthGate() {
  return useContext(AuthGateContext);
}

export function AuthGateProvider({ children }) {
  const { user } = useAuth();
  const [reason, setReason] = useState(null); // null = kapalı, string = açık modal metni

  function requireAuth(msg) {
    if (user) return true;
    setReason(msg || "Devam etmek için giriş yap.");
    return false;
  }

  return (
    <AuthGateContext.Provider value={{ requireAuth }}>
      {children}
      {reason && <LoginModal reason={reason} onClose={() => setReason(null)} />}
    </AuthGateContext.Provider>
  );
}

function LoginModal({ reason, onClose }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    const v = val.trim();
    if (!v) { setErr("E-posta adresini gir."); return; }
    if (!/^\S+@\S+\.\S+$/.test(v)) { setErr("Geçerli bir e-posta gir."); return; }
    setErr("");
    setBusy(true);
    const { error } = await signInWithEmail(v);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  }

  return (
    <div className="ak-modal-veil" onClick={onClose}>
      <div className="ak-modal ak-authgate" onClick={(e) => e.stopPropagation()}>
        <Lock size={22} />
        <h3>Giriş yap</h3>
        <p>{reason}</p>
        {done ? (
          <p className="ak-authgate-done"><Clock size={15} /> Sihirli link e-postana gönderildi — gelen kutunu kontrol et.</p>
        ) : (
          <>
            <div className="ak-authgate-in">
              <Mail size={15} />
              <input
                type="email"
                placeholder="E-posta adresin"
                value={val}
                onChange={(e) => { setVal(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />
            </div>
            {err && <p className="ak-authgate-err">{err}</p>}
            <div className="ak-modal-btns">
              <button className="ak-btn ak-btn-ghost" onClick={onClose}>Vazgeç</button>
              <button className="ak-btn ak-btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Gönderiliyor…" : <><Send size={14} /> Giriş linki gönder</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
