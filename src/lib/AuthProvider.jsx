import { createContext, useContext, useEffect, useState } from "react";
import { getSession, onAuthStateChange } from "./supabase.js";

const AuthContext = createContext({ user: null, session: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    getSession().then((s) => { if (on) { setSession(s); setLoading(false); } });
    const { data } = onAuthStateChange((_event, s) => { if (on) setSession(s); });
    return () => { on = false; data?.subscription?.unsubscribe?.(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user || null, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
