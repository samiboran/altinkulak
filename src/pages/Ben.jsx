import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Monitor, Smartphone, Target, Brain, Plus, ShieldAlert, BookLock, FlaskConical, Trash2, Upload, Download, Zap, Flame, History, Award, CheckCircle2 } from "lucide-react";
import { addTrade, listTrades, summary, TAGS, SETUPS } from "../lib/ledger.js";
import { addSandbox, listSandbox, removeSandbox } from "../lib/sandbox.js";
import { edgeRank, contribRank } from "../lib/ranks.js";
import { parseTradesCSV, dedupeKey, exportTradesCSV } from "../lib/csv.js";
import { useAuthGate } from "../lib/AuthGate.jsx";
import { useAuth } from "../lib/AuthProvider.jsx";
import {
  listPointEvents, checkAndAwardStreaks, spendPoints, deriveBalance, deriveLifetime,
  currentStreakDays, spendItemStatus, canPurchase, SPENDING_TABLE, EARNING_TABLE, awardPoints,
} from "../lib/points.js";
import { deriveProgress, newlyCompleted } from "../lib/achievements.js";
import { fetchProfileStats, fetchFollowCounts } from "../lib/profileStats.js";
import { fetchProfileById } from "../lib/supabase.js";
import IdentityStats from "../components/IdentityStats.jsx";
import "../styles/ben.css";

// AK-023-EXT: event -> okunabilir etiket (kazanım tipleri EARNING_TABLE'dan, harcama SPENDING_TABLE'dan)
function pointEventLabel(e) {
  if (e.type === "spend") {
    const item = SPENDING_TABLE.find((i) => i.key === e.ref_id);
    return item ? `Harcandı — ${item.label}` : "Harcama";
  }
  const row = EARNING_TABLE.find((r) => r.key === e.type);
  return row ? row.label : e.type;
}
const fmtDT = (ms) => new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });

const TAGCOL = { "Plana uydu": "ok", "Erken çıkış": "warn", "FOMO": "bad", "İntikam": "bad" };
const fmtD = (iso) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

export default function Ben() {
  const { requireAuth } = useAuthGate();
  const { user } = useAuth();
  const [trades, setTrades] = useState(listTrades);
  const [sand, setSand] = useState(listSandbox);
  const [mode, setMode] = useState("sicil"); // sicil = kalıcı · sandbox = serbest pratik
  const [f, setF] = useState({ sym: "", setup: "FVG", dir: "Long", plan: 2, r: "", tag: "Plana uydu" });
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false); // çift-tık koruması (diğer oturum bulgusu, yeniden uygulandı)
  const [err, setErr] = useState("");
  // CSV import (AK-025): önizleme -> hedef seçimi -> yaz
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null); // { rows, errors, skipped }

  // AK-023-EXT: Kulak Puanı — event log Supabase'ten gelir (localStorage DEĞİL, contrib rank
  // başka kullanıcıların gördüğü public bir alan). Giriş yoksa sessizce boş kalır.
  const [points, setPoints] = useState([]);
  const [spendBusy, setSpendBusy] = useState(null); // hangi kalem satın alınıyor (çift-tık koruması)
  const [spendMsg, setSpendMsg] = useState(null);
  useEffect(() => {
    let on = true;
    if (!user) { setPoints([]); return; }
    (async () => {
      await checkAndAwardStreaks(user.id, trades); // sicil serisi uygunsa otomatik ödül (idempotent)
      const ev = await listPointEvents(user.id);
      if (on) setPoints(ev);
    })();
    return () => { on = false; };
  }, [user, trades]);

  // AK-086 K1/K2: kimlik kartı şeridi + Başarımlar kartı — tek stats nesnesi (profileStats.js).
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({});
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [newAchieveMsg, setNewAchieveMsg] = useState(null);
  const awardingRef = useRef(false);

  useEffect(() => {
    let on = true;
    if (!user) { setProfile(null); return; }
    fetchProfileById(user.id).then((p) => { if (on) setProfile(p); });
    return () => { on = false; };
  }, [user]);

  useEffect(() => {
    let on = true;
    if (!user) { setStats({}); return; }
    fetchProfileStats(profile, { isOwner: true, trades }).then((s) => { if (on) setStats(s); });
    return () => { on = false; };
  }, [user, profile, trades]);

  useEffect(() => {
    let on = true;
    if (!user) { setFollowCounts({ followers: 0, following: 0 }); return; }
    fetchFollowCounts(user.id).then((c) => { if (on) setFollowCounts(c); });
    return () => { on = false; };
  }, [user]);

  // K2 kutlama + ödül: tamamlanan başarımın KENDİ ANAHTARI point_events.type olarak kullanılır —
  // bu hem points.js'e dokunmadan (imzalar değişmez) idempotent bir dedup anahtarı verir (bir kez
  // ödüllenen başarım bir daha "newlyCompleted" dönmez, gerçek Supabase log'undan türetilir — D9),
  // hem de EARNING_TABLE'a yeni satır eklemeyi gerektirmez.
  useEffect(() => {
    if (!user || awardingRef.current) return;
    const awardedKeys = points.map((e) => e.type);
    const fresh = newlyCompleted(stats, awardedKeys);
    if (!fresh.length) return;
    awardingRef.current = true;
    (async () => {
      for (const a of fresh) await awardPoints(user.id, a.key, a.points, a.key);
      setPoints(await listPointEvents(user.id));
      setNewAchieveMsg(fresh.map((a) => `${a.title} +${a.points}`).join(" · "));
      setTimeout(() => setNewAchieveMsg((m) => (m === fresh.map((a) => `${a.title} +${a.points}`).join(" · ") ? null : m)), 5000);
      awardingRef.current = false;
    })();
  }, [stats, points, user]);

  async function buyItem(item) {
    if (!requireAuth("Enerji harcamak için giriş yap.")) return;
    if (spendBusy) return;
    setSpendBusy(item.key);
    setSpendMsg(null);
    const res = await spendPoints(user.id, item);
    if (res.ok) {
      setPoints(await listPointEvents(user.id));
      setSpendMsg({ key: item.key, ok: true, text: "Etkinleştirildi." });
    } else {
      setSpendMsg({ key: item.key, ok: false, text: res.reason || "İşlem başarısız." });
    }
    setSpendBusy(null);
  }

  // AK-080 C2: CSV içe aktarma sicile/sandbox'a kalıcı yazım demek — dosya seçiciyi açmadan önce duvar.
  function onCSVClick() {
    if (!requireAuth("Sicile veya Sandbox'a aktarmak için giriş yap.")) return;
    fileRef.current?.click();
  }

  function onCSV(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const { rows, errors } = parseTradesCSV(rd.result);
      // mükerrer eleme: hem dosya içi hem mevcut kayıtlara karşı
      const seen = new Set([...listTrades(), ...listSandbox()].map(dedupeKey));
      const fresh = [];
      let skipped = 0;
      for (const r of rows) {
        const k = dedupeKey(r);
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k); fresh.push(r);
      }
      setImp({ rows: fresh, errors, skipped });
    };
    rd.readAsText(file);
  }

  // AK-063: sicili CSV olarak indir — parseTradesCSV ile round-trip uyumlu (do_not_touch: kolon formatı)
  function downloadCSV() {
    const csv = exportTradesCSV(trades);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sicil-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function doImport(target) {
    if (!imp || submitting) return;
    setSubmitting(true);
    const add = target === "sicil" ? addTrade : addSandbox;
    let ok = 0;
    for (const r of imp.rows) { if (add(r)) ok++; }
    setTrades(listTrades());
    setSand(listSandbox());
    setImp(null);
    setMode(target);
    setErr("");
    setSubmitting(false);
    alert(`${ok} işlem ${target === "sicil" ? "SİCİLE (kalıcı)" : "Sandbox'a"} aktarıldı.`);
  }

  const s = summary(trades);
  const gap = s.n && s.avgPlan != null ? s.avgPlan - s.avgRealWin : 0;
  const rank = edgeRank(trades); // yalnız SİCİL sayılır — sandbox asla

  // AK-023-EXT: bakiye harcanınca düşer, lifetime ASLA düşmez (D15) — contribRank BUNDAN beslenir.
  const balance = deriveBalance(points);
  const lifetime = deriveLifetime(points);
  const contrib = contribRank(lifetime);
  const streak = currentStreakDays(trades);
  const history = [...points].sort((a, b) => b.ts - a.ts);

  function tryAdd() {
    setErr("");
    if (!requireAuth(mode === "sicil" ? "Sicile işlemek için giriş yap." : "Sandbox'a kayıt için giriş yap.")) return;
    if (!f.sym.trim() || f.r === "" || !Number(f.plan)) { setErr("Sembol, plan R:R ve sonuç R zorunlu."); return; }
    if (mode === "sandbox") { // pratik alanı: onay gerekmez
      const e = addSandbox(f);
      if (!e) { setErr("Kayıt geçersiz — alanları kontrol et."); return; }
      setSand(listSandbox());
      setF({ ...f, sym: "", r: "" });
      return;
    }
    setConfirm(true); // sicile yazmadan önce kalıcılık onayı
  }
  function doAdd() {
    if (submitting) return;
    setSubmitting(true);
    const e = addTrade(f);
    if (!e) { setErr("Kayıt geçersiz — alanları kontrol et."); setConfirm(false); setSubmitting(false); return; }
    setTrades(listTrades());
    setF({ ...f, sym: "", r: "" });
    setConfirm(false);
    setSubmitting(false);
  }

  return (
    <div className="ak-ben">
      <span className="ak-eyebrow">KİŞİSEL</span>
      <h1>Panon</h1>
      <p className="ak-ben-lead">İlerlemen, işlem geçmişin ve disiplinin burada. Asıl soru kazanç oranı değil: planına uyuyor musun, yoksa kendini mi kandırıyorsun?</p>

      {/* AK-086 K1: kimlik kartı istatistik şeridi — Fikirler/Takipçi/Takip Edilen */}
      {user && <IdentityStats profileId={user.id} ideas={stats.ideas || 0} followers={followCounts.followers} following={followCounts.following} />}

      {/* Edge Rütbesi — sicilden, bağlamıyla birlikte */}
      <div className="ak-rankcard">
        <div className="ak-rank-main">
          <span className="ak-rank-name">{rank.name}</span>
          <span className="ak-rank-ctx">{rank.n} sayılan işlem · {rank.totalR >= 0 ? "+" : ""}{rank.totalR}R (±2R tavanlı) · t = {rank.t}</span>
        </div>
        {rank.next && (
          <span className="ak-rank-next">
            Sıradaki: <b>{rank.next.name}</b>{rank.next.needs.length ? " — " + rank.next.needs.join(", ") : ""}
          </span>
        )}
        <p className="ak-rank-note">Rütbe kazanç oranından gelmez: sınırlandırılmış R birikimi + istatistik. Tek büyük işlemle atlanamaz; sicil silinmediği için geri de alınamaz.</p>
      </div>

      {/* AK-023-EXT: Enerji kartı — Kulak Puanı bakiyesi + katkı rütbesi.
          Veri Supabase point_events'ten (Code'un points.js modülü) — public rank cihaz-içi
          veriden beslenemez; yapılandırılmamışsa kart 0 gösterir, fabrike veri yok (D6). */}
      <EnerjiKart />

      {/* AK-023-EXT: Kulak Puanı — bakiye harcanınca düşer, lifetime (Katkı Rütbesi'ni besleyen) düşmez */}
      {user && (
        <div className="ak-rankcard ak-energy-card">
          <div className="ak-rank-main">
            <span className="ak-rank-name energy"><Zap size={18} /> {balance} enerji</span>
            <span className="ak-rank-ctx">
              {lifetime} lifetime · Katkı Rütbesi: {contrib.name}
              {streak >= 7 && <> · <Flame size={12} /> {streak} gün seri</>}
            </span>
          </div>
          {contrib.next && (
            <span className="ak-rank-next">Sıradaki: <b>{contrib.next.name}</b> — {contrib.next.needP} puan daha</span>
          )}
          <p className="ak-rank-note">Enerji harcanabilir ama lifetime hiç düşmez — Katkı Rütbesi'ni harcadıkça kaybetmezsin. <Link to="/puanlar">Nasıl kazanılır?</Link></p>
        </div>
      )}

      {/* AK-086 K2: Başarımlar — deriveProgress(stats) achievements.js'ten değişmeden, 8 kademe */}
      {user && (
        <div className="ak-achieve-card">
          <h2><Award size={15} /> Başarımlar</h2>
          {newAchieveMsg && <p className="ak-achieve-toast">🎉 {newAchieveMsg}</p>}
          <div className="ak-achieve-list">
            {deriveProgress(stats).map((a) => (
              <div className={"ak-achieve-row" + (a.done ? " done" : "")} key={a.key}>
                <div className="ak-achieve-top">
                  <span className="ak-achieve-title">{a.done && <CheckCircle2 size={13} />} {a.title}</span>
                  <span className="ak-achieve-pts">+{a.points}</span>
                </div>
                <p className="ak-achieve-desc">{a.desc}</p>
                <div className="ak-achieve-bar"><div style={{ width: a.pct + "%" }} /></div>
                <span className="ak-achieve-ctx">{a.current}/{a.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ak-ben-cards">
        <div className="ak-ben-stat"><span className="v">{s.n}</span><span className="k">Sicildeki işlem</span></div>
        <div className="ak-ben-stat"><span className={"v " + (s.totalR >= 0 ? "ok" : "")}>{s.n ? (s.totalR >= 0 ? "+" : "") + s.totalR + "R" : "—"}</span><span className="k">Toplam sonuç</span></div>
        <div className="ak-ben-stat"><span className={"v " + (s.adherence >= 70 ? "ok" : "")}>{s.adherence != null ? "%" + s.adherence : "—"}</span><span className="k">Plana uyum</span></div>
        <div className="ak-ben-stat"><span className="v">{s.bestSym || "—"}</span><span className="k">En iyi sembol</span></div>
      </div>

      {/* Mod seçimi: Sicil (kalıcı) / Sandbox (serbest pratik) */}
      <div className="ak-ben-modes">
        <div className="ak-seg">
          <button className={mode === "sicil" ? "on" : ""} onClick={() => setMode("sicil")}><BookLock size={13} /> Sicil</button>
          <button className={mode === "sandbox" ? "on" : ""} onClick={() => setMode("sandbox")}><FlaskConical size={13} /> Sandbox</button>
        </div>
        {mode === "sandbox" && <span className="ak-sand-note">Serbest pratik — silinebilir, hiçbir istatistiğe ve rütbeye sayılmaz.</span>}
      </div>

      {/* İşlem ekleme */}
      <div className={"ak-ben-form" + (mode === "sandbox" ? " sand" : "")}>
        <div className="ak-ben-formhead">
          {mode === "sicil" ? <><BookLock size={15} /> Sicile işle <em>kalıcı kayıt — silinemez, düzenlenemez</em></>
                            : <><FlaskConical size={15} /> Sandbox'a işle <em>pratik — istediğin gibi sil</em></>}
          <button className="ak-csv-btn" onClick={onCSVClick} title="CSV formatı: sym,dir,plan,r[,tag,setup,d]"><Upload size={13} /> CSV içe aktar</button>
          <button className="ak-csv-btn" onClick={downloadCSV} disabled={!trades.length} title="Sicili CSV olarak indir"><Download size={13} /> CSV indir</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCSV} />
        </div>
        <div className="ak-ben-formrow">
          <input placeholder="Sembol (BTC…)" value={f.sym} onChange={e => setF({ ...f, sym: e.target.value })} />
          <select value={f.setup} onChange={e => setF({ ...f, setup: e.target.value })}>{SETUPS.map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.dir} onChange={e => setF({ ...f, dir: e.target.value })}><option>Long</option><option>Short</option></select>
          <input type="number" step="0.5" min="0.5" placeholder="Plan R:R" value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })} />
          <input type="number" step="0.1" placeholder="Sonuç R (örn -1, 2)" value={f.r} onChange={e => setF({ ...f, r: e.target.value })} />
          <select value={f.tag} onChange={e => setF({ ...f, tag: e.target.value })}>{TAGS.map(x => <option key={x}>{x}</option>)}</select>
          <button className="ak-btn ak-btn-primary" onClick={tryAdd}><Plus size={15} /> {mode === "sicil" ? "İşle" : "Pratik ekle"}</button>
        </div>
        {err && <p className="ak-ben-err">{err}</p>}
      </div>

      {/* Disiplin paneli — gerçek sicilden */}
      {s.n >= 3 && (
        <div className="ak-disc">
          <div className="ak-disc-head"><Target size={15} /> Disiplin — planlanan vs gerçekleşen</div>
          <div className="ak-disc-grid">
            <div><b>1:{s.avgPlan.toFixed(1)}</b><span>ort. planlanan R:R</span></div>
            <div><b className="warn">+{s.avgRealWin.toFixed(1)}R</b><span>ort. gerçekleşen (kazançta)</span></div>
            <div><b className={s.adherence >= 70 ? "ok" : "warn"}>%{s.adherence}</b><span>plana uyum</span></div>
          </div>
          {gap > 0.2 && (
            <p className="ak-disc-note"><Brain size={13} /> Planın ortalama {s.avgPlan.toFixed(1)}R, kazançların ortalama {s.avgRealWin.toFixed(1)}R. Sorun setup <b>seçiminde değil, yürütmede</b> — erken çıkıyorsun. Edge'in var ama disiplin onu kemiriyor.</p>
          )}
        </div>
      )}

      {/* AK-023-EXT: harcama mağazası — "satın al" DEĞİL "aç/etkinleştir" (D15: para birimi değil) */}
      {user && (
        <div className="ak-energy-store">
          <h2><Zap size={15} /> Enerjini kullan</h2>
          <div className="ak-energy-grid">
            {SPENDING_TABLE.map((item) => {
              const status = spendItemStatus(points, item);
              const check = canPurchase(points, item, balance);
              const msg = spendMsg?.key === item.key ? spendMsg : null;
              return (
                <div className={"ak-energy-item" + (status.active ? " active" : "")} key={item.key}>
                  <span className="lbl">{item.label}</span>
                  <span className="cost mono">{item.cost} enerji</span>
                  {status.active && (
                    <span className="status">
                      {item.durationDays ? `Aktif — ${Math.max(0, Math.ceil((status.expiresAt - Date.now()) / 86400000))} gün kaldı` : "Sahipsin"}
                    </span>
                  )}
                  <button
                    className="ak-btn ak-btn-secondary sm"
                    disabled={!check.ok || spendBusy === item.key}
                    title={!check.ok ? check.reason : undefined}
                    onClick={() => buyItem(item)}
                  >
                    {spendBusy === item.key ? "…" : "Aç / Etkinleştir"}
                  </button>
                  {msg && <span className={"msg " + (msg.ok ? "ok" : "no")}>{msg.text}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AK-023-EXT: kazanım/harcama geçmişi — event timeline */}
      {user && history.length > 0 && (
        <div className="ak-energy-history">
          <h2><History size={15} /> Enerji geçmişi</h2>
          <div className="ak-energy-hist-list">
            {history.map((e) => (
              <div className={"ak-energy-hist-row" + (e.amount < 0 ? " neg" : "")} key={e.id}>
                <span>{pointEventLabel(e)}</span>
                <span className="mono">{e.amount >= 0 ? "+" : ""}{e.amount}</span>
                <span className="dt">{fmtDT(e.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ak-ben-logwrap">
        <div className="ak-ben-loghead">
          <div className="ak-ben-tabs">
            <button className={"ak-ben-tab" + (mode === "sicil" ? " on" : "")} onClick={() => setMode("sicil")}>
              <BookLock size={13} /> Sicil <span className="ak-ben-tabcount">{trades.length}</span>
            </button>
            <button className={"ak-ben-tab" + (mode === "sandbox" ? " on" : "")} onClick={() => setMode("sandbox")}>
              <FlaskConical size={13} /> Sandbox <span className="ak-ben-tabcount">{sand.length}</span>
            </button>
          </div>
          <span className="ak-sync"><Monitor size={13} /> Masaüstü: tam · <Smartphone size={13} /> Telefon: özet</span>
        </div>
        {(mode === "sicil" ? trades : sand).length === 0 ? (
          <div className="ak-ben-empty">
            {mode === "sicil"
              ? <><BookLock size={24} /><p>Sicil boş. İlk işlemini yukarıdan işle — ama unutma: sicile yazılan silinmez. Çekinirsen önce Sandbox'ta pratik yap.</p></>
              : <><FlaskConical size={24} /><p>Sandbox boş. Burası pratik alanı — ekle, sil, dene. Hazır hissedince Sicil'e geç.</p></>}
          </div>
        ) : (
          <div className="ak-log">
            <div className="ak-log-h"><span>Sembol</span><span>Yön</span><span>Plan</span><span>R</span><span>Etiket</span><span>Tarih</span></div>
            {[...(mode === "sicil" ? trades : sand)].reverse().map((l) => (
              <div className={"ak-log-r" + (mode === "sandbox" ? " sand" : "")} key={l.id}>
                <span className="sy">{l.sym}</span>
                <span className="dr">{l.dir}</span>
                <span className="pl">1:{l.plan.toFixed(1)}</span>
                <span className={"rr " + (l.r > 0 ? "pos" : "neg")}>{l.r > 0 ? "+" : ""}{l.r.toFixed(1)}R</span>
                <span className={"tg " + (TAGCOL[l.tag] || "")}>
                  {l.tag}
                  {mode === "sandbox" && <button className="ak-del" onClick={() => { removeSandbox(l.id); setSand(listSandbox()); }} title="Sil (sandbox)"><Trash2 size={13} /></button>}
                </span>
                <span className="dt">{fmtD(l.d)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV önizleme + hedef seçimi */}
      {imp && (
        <div className="ak-modal-veil" onClick={() => setImp(null)}>
          <div className="ak-modal ak-imp" onClick={e => e.stopPropagation()}>
            <Upload size={20} />
            <h3>CSV önizleme</h3>
            <p><b>{imp.rows.length}</b> geçerli işlem{imp.skipped > 0 && <> · {imp.skipped} mükerrer atlandı</>}{imp.errors.length > 0 && <> · <span style={{ color: "var(--bad)" }}>{imp.errors.length} hatalı satır</span></>}</p>
            {imp.errors.length > 0 && <div className="ak-imp-errs">{imp.errors.slice(0, 4).map((e, i) => <div key={i}>{e}</div>)}{imp.errors.length > 4 && <div>… +{imp.errors.length - 4} daha</div>}</div>}
            {imp.rows.length > 0 && (
              <div className="ak-imp-prev">
                {imp.rows.slice(0, 5).map((r, i) => <div key={i}><b>{r.sym}</b> {r.dir} · 1:{r.plan} · {r.r > 0 ? "+" : ""}{r.r}R · {r.tag}</div>)}
                {imp.rows.length > 5 && <div>… +{imp.rows.length - 5} işlem daha</div>}
              </div>
            )}
            <p className="warn">Sicil'e aktarılan {imp.rows.length} kayıt kalıcı olur — silinemez. Emin değilsen Sandbox'a al, incele.</p>
            <div className="ak-modal-btns">
              <button className="ak-btn ak-btn-ghost" onClick={() => setImp(null)}>Vazgeç</button>
              <button className="ak-btn ak-btn-ghost" disabled={!imp.rows.length || submitting} onClick={() => doImport("sandbox")}>Sandbox'a al</button>
              <button className="ak-btn ak-btn-primary" disabled={!imp.rows.length || submitting} onClick={() => doImport("sicil")}>Sicile işle (kalıcı)</button>
            </div>
          </div>
        </div>
      )}

      {/* Kalıcılık onayı */}
      {confirm && (
        <div className="ak-modal-veil" onClick={() => setConfirm(false)}>
          <div className="ak-modal" onClick={e => e.stopPropagation()}>
            <ShieldAlert size={22} />
            <h3>Sicile kalıcı yazılacak</h3>
            <p>{f.sym.toUpperCase()} · {f.dir} · plan 1:{Number(f.plan).toFixed(1)} · sonuç {Number(f.r) > 0 ? "+" : ""}{Number(f.r).toFixed(1)}R · {f.tag}</p>
            <p className="warn">Bu kayıt silinemez ve düzenlenemez. Sicil, kendine karşı dürüstlüğündür.</p>
            <div className="ak-modal-btns">
              <button className="ak-btn ak-btn-ghost" onClick={() => setConfirm(false)}>Vazgeç</button>
              <button className="ak-btn ak-btn-primary" disabled={submitting} onClick={doAdd}>Onayla, sicile işle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function EnerjiKart() {
  const { user } = useAuth();
  const [ev, setEv] = useState([]);
  useEffect(() => {
    let ok = true;
    if (user?.id) listPointEvents(user.id).then(r => { if (ok) setEv(r || []); });
    return () => { ok = false; };
  }, [user?.id]);
  const lifetime = deriveLifetime(ev);
  const balance = deriveBalance(ev);
  const cr = contribRank(lifetime);
  return (
    <div className="ak-rankcard" style={{ marginTop: 10 }}>
      <div className="ak-rank-main">
        <span className="ak-rank-name">⚡ {balance} puan</span>
        <span className="ak-rank-ctx">toplam kazanılan {lifetime} · katkı rütbesi: {cr.name}</span>
      </div>
      {cr.next && <span className="ak-rank-next">Sıradaki: <b>{cr.next.name}</b> — {cr.next.needP} puan kaldı</span>}
      <p className="ak-rank-note">Kulak Puanı topluluğa katkıdan kazanılır, özellik açmak için harcanır — harcamak katkı rütbeni düşürmez. Kurallar: <a href="#/puanlar" style={{ color: "inherit" }}>/puanlar</a>. Edge Rütbesi'ne asla etki etmez.</p>
    </div>
  );
}
