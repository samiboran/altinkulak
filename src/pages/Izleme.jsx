import { useState, useEffect } from "react";
import { Eye, Plus, Trash2, ShieldCheck, Bell, BellRing, Settings, Star, Wallet, X } from "lucide-react";
import { getBars, loadReal, isReal, hasData, stats24h, getFreshness, getSearchSymbols, loadTop500Symbols } from "../lib/data.js";
import { runBacktest } from "../lib/backtest.js";
import { detectModBSignals, DEFAULT_PARAMS } from "../lib/modB.js";
import { requestNotifyPermission, notify, isSeen, markSeen } from "../lib/notify.js";
import { addAlarmTrade, checkOpenAlarmTrades, listAlarmTrades } from "../lib/alarmTrades.js";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import PortfolioPanel from "../components/PortfolioPanel.jsx";
import { shouldShowNudge, nextNudgeState, loadNudgeState, saveNudgeState } from "../lib/nudge.js";
import "../styles/izleme.css";

const WKEY = "ak_watch_v1";
const SKEY = "ak_my_system_v1";
const BADGE_KEY = "ak_seen_signal_ids_v1"; // AK-052: notify.js'teki isSeen/markSeen'den ayrı — sadece "YENİ" rozeti için
const FAV_KEY = "ak_favorites_v1"; // AK-061: Lab.jsx sembol seçiciyle paylaşılan aynı anahtar
const POLL_MS = 5 * 60 * 1000; // 5 dakika
function load() { try { return JSON.parse(localStorage.getItem(WKEY)) || ["BTC", "ETH", "SOL", "AVAX"]; } catch { return ["BTC"]; } }
function loadFavorites() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); } }
function loadSystem() {
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY));
    if (saved && typeof saved === "object") return { name: "Sistemim", ...DEFAULT_PARAMS, ...saved };
  } catch {}
  return { name: "Sistemim", ...DEFAULT_PARAMS };
}
function loadBadgeSeen() { try { return new Set(JSON.parse(localStorage.getItem(BADGE_KEY)) || []); } catch { return new Set(); } }
function saveBadgeSeen(set) { try { localStorage.setItem(BADGE_KEY, JSON.stringify([...set])); } catch { /* dolu — önemsiz */ } }

// AK-048: goreli zaman. s.time gercek epoch ms degilse (mock/ornek veride barIndex'e duser,
// yani 1e12'den kucuktur) sessizce null doner — yanlis tarih gostermektense hic gostermemek.
function timeAgo(ms) {
  if (!ms || ms < 1e12) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return null;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa ${min % 60} dk önce`;
  return `${Math.floor(hr / 24)} gün önce`;
}

// AK-076: alarm işlemi ne kadar sürede kapandı — bildirim metninde "X sa Y dk sürdü" için
function durationLabel(startMs, endMs) {
  if (!startMs || !endMs || endMs < startMs || startMs < 1e12) return null;
  const diff = endMs - startMs;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa ${min % 60} dk`;
  return `${Math.floor(hr / 24)} gün ${hr % 24} sa`;
}

// AK-064: "Binance'e bağlı · X sn/dk gecikme" rozeti için okunabilir süre
function fmtDelay(ageSec) {
  if (ageSec < 60) return `${ageSec} sn`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)} dk`;
  return `${Math.floor(ageSec / 3600)} sa`;
}
function freshnessLabel(fresh) {
  if (!fresh) return null;
  if (fresh.status === "canli") return "Binance'e bağlı · az önce";
  if (fresh.status === "gecikmeli") return `Binance'e bağlı · ${fmtDelay(fresh.ageSec)} gecikme`;
  return `Bağlantı yok · ${fmtDelay(fresh.ageSec)} önce senkron`;
}

function Spark({ sym }) {
  const b = getBars(sym).slice(-40).map(x => x.c);
  const lo = Math.min(...b), hi = Math.max(...b), rg = hi - lo || 1;
  const up = b[b.length - 1] >= b[0];
  const pts = b.map((c, i) => `${(i / (b.length - 1)) * 100},${30 - ((c - lo) / rg) * 28 - 1}`).join(" ");
  return <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="ak-wspark"><polyline points={pts} className={up ? "up" : "dn"} /></svg>;
}

export default function Izleme() {
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  // AK-080 C3: İzleme Listesi <-> Portföy sekmesi — PortfolioPanel.jsx AK-078'den değişmeden
  // yeniden kullanılır, guest için de localStorage üzerinden TAM çalışır.
  const [section, setSection] = useState("izleme"); // izleme | portfoy
  const [nudgeState, setNudgeState] = useState(loadNudgeState);
  const showNudge = !user && shouldShowNudge(nudgeState);
  function dismissNudge() {
    const next = nextNudgeState(nudgeState);
    saveNudgeState(next);
    setNudgeState(next);
  }
  const [list, setList] = useState(load);
  const [q, setQ] = useState("");
  const [, setDataV] = useState(0);
  const [notifyPerm, setNotifyPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const [signals, setSignals] = useState([]);
  const [system, setSystem] = useState(loadSystem);
  const [showSettings, setShowSettings] = useState(false);
  const [sortMode, setSortMode] = useState("varsayilan"); // AK-057: varsayilan | az | chg24h
  const [favorites, setFavorites] = useState(loadFavorites); // AK-061: favori semboller, listenin en üstüne sabitlenir
  const [alarmHistory, setAlarmHistory] = useState(listAlarmTrades); // AK-076: sinyal geldiğinde otomatik açılan hayali işlemler
  useEffect(() => { try { localStorage.setItem(WKEY, JSON.stringify(list)); } catch {} }, [list]);
  useEffect(() => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch {} }, [favorites]);
  useEffect(() => { try { localStorage.setItem(SKEY, JSON.stringify(system)); } catch {} }, [system]);

  // AK-048: dakikada bir "X dk önce" metnini tazele — signals dizisi yeniden hesaplanmaz
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // AK-074: piyasa değerine göre ilk 500 kripto — yalnız sembol-ekle arama kutusuna
  const [, setTop500V] = useState(0);
  useEffect(() => { let on = true; loadTop500Symbols().then(() => on && setTop500V(v => v + 1)); return () => { on = false; }; }, []);
  const searchSymbols = getSearchSymbols();

  // AK-004b: listedeki gerçek-kaynaklı semboller arka planda yüklenir
  useEffect(() => {
    let on = true;
    Promise.all(list.map((s) => loadReal(s).catch(() => null)))
      .then((r) => { if (on && r.some(Boolean)) setDataV(v => v + 1); });
    return () => { on = false; };
  }, [list]);

  const fmtP = (p) => {
    const a = Math.abs(p);
    if (a >= 10000) return Math.round(p).toLocaleString("en-US");
    if (a >= 1000) return p.toFixed(0);
    if (a >= 100) return p.toFixed(1);
    if (a >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  // AK-049: kullanıcının kendi ayarladığı "Sistemim" ile canlı sinyal taraması — sekme açıkken 5dk'da bir, yalnız bu tarayıcıda bildirim.
  // AK-076: her yeni sinyal için arkada bir "alarm işlemi" açılır; her poll'da açık işlemler kontrol edilip
  // kapananlar (kazandı/kaybetti) ikinci bir bildirimle haber verilir.
  useEffect(() => {
    let on = true;
    function scan() {
      const all = [];
      const barsBySym = {};
      for (const sym of list) {
        if (!hasData(sym)) continue;
        const b = getBars(sym);
        if (!b || b.length < 60) continue;
        barsBySym[sym] = b;
        all.push(...detectModBSignals(b, sym, system));
      }
      all.sort((a, b) => (b.time || 0) - (a.time || 0));
      const top = all.slice(0, 10);
      if (!on) return;
      // AK-052: "YENİ" rozeti — bildirim iznine bakmaz, kendi görülme kaydını tutar
      const badgeSeen = loadBadgeSeen();
      setSignals(top.map(s => ({ ...s, isNew: !badgeSeen.has(s.id) })));
      const updated = new Set(badgeSeen);
      for (const s of top) updated.add(s.id);
      saveBadgeSeen(updated);
      for (const s of top) {
        if (!isSeen(s.id)) {
          markSeen(s.id);
          addAlarmTrade(s); // AK-076: sinyal ilk kez görüldü — arkada hayali işlem açılır
          notify(
            `${system.name || "Sistemim"}: ${s.sym} ${s.dir === 1 ? "LONG" : "SHORT"}`,
            `Giriş ${fmtP(s.entry)} · Stop ${fmtP(s.stop)} · Hedef1 ${fmtP(s.hedef1)} · Hedef2 ${fmtP(s.hedef2)}`
          );
        }
      }
      // AK-076: açık alarm işlemlerini güncel barlarla kontrol et — kapananlar için sonuç bildirimi
      let closedAny = false;
      for (const sym of Object.keys(barsBySym)) {
        const closed = checkOpenAlarmTrades(sym, barsBySym[sym]);
        for (const t of closed) {
          closedAny = true;
          const won = t.status === "won";
          const dur = durationLabel(t.openedAt, t.closedAt);
          notify(
            `${t.sym} ${t.dir === 1 ? "LONG" : "SHORT"}: ${won ? "Hedef1'e ulaştı ✅" : "Stop'a takıldı ❌"}`,
            `Giriş ${fmtP(t.entry)}${dur ? ` · ${dur} sürdü` : ""}`
          );
        }
      }
      if (closedAny || top.length) setAlarmHistory(listAlarmTrades());
    }
    scan();
    const id = setInterval(scan, POLL_MS);
    return () => { on = false; clearInterval(id); };
  }, [list, system]);

  async function enableNotify() { setNotifyPerm(await requestNotifyPermission()); }

  function add() { const s = q.trim().toUpperCase(); if (s && !list.includes(s)) setList(l => [...l, s]); setQ(""); }
  function del(s) { setList(l => l.filter(x => x !== s)); }
  function setParam(key, val) { setSystem(s => ({ ...s, [key]: val })); }
  function resetSystem() { setSystem({ name: "Sistemim", ...DEFAULT_PARAMS }); }
  function toggleFav(sym) { setFavorites(f => { const n = new Set(f); n.has(sym) ? n.delete(sym) : n.add(sym); return n; }); }

  const rows = list.map(sym => {
    if (!hasData(sym)) return { sym, bad: true }; // ne gerçek ne tanımlı sentetik -> "veri yok" (sahte edge yakma!)
    const b = getBars(sym);
    if (!b || b.length < 60) return { sym, bad: true };
    const last = b[b.length - 1].c, prev = b[b.length - 2].c, chg = ((last - prev) / prev) * 100;
    const r = runBacktest(b, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 });
    const meta = searchSymbols.find(x => x.sym === sym);
    const real = isReal(sym);
    // AK-057: 24s değişim yalnız gerçek veride anlamlı — sentetikte null (sıralama dışı kalır)
    const chg24h = real ? stats24h(b)?.chgPct ?? null : null;
    const fresh = real ? getFreshness(sym) : null; // AK-064: "Binance'e bağlı · X gecikme" rozeti
    return { sym, name: meta?.name || sym, group: meta?.group || "—", real, last, chg, chg24h, fresh, t: r.tStat, edge: r.verdict.good };
  });

  // AK-057: sıralama — "24s Değişim" yalnız gerçek-veri satırlarını sıralar, sentetik/veri-yok
  // satırlar sıralama dışı bırakılıp listenin sonunda orijinal sırayla kalır.
  const sortedRows = (() => {
    if (sortMode === "az") return [...rows].sort((a, b) => a.sym.localeCompare(b.sym));
    if (sortMode === "chg24h") {
      const ranked = rows.filter(r => !r.bad && r.chg24h != null).sort((a, b) => b.chg24h - a.chg24h);
      const rest = rows.filter(r => r.bad || r.chg24h == null);
      return [...ranked, ...rest];
    }
    return rows;
  })();

  // AK-061: favoriler, seçili sıralama modundan bağımsız olarak listenin en üstüne sabitlenir
  // (kendi aralarındaki sıra sortedRows'tan korunur — sadece iki parçaya ayrılıp yeniden birleştirilir).
  const pinnedRows = (() => {
    const favs = sortedRows.filter(r => favorites.has(r.sym));
    const rest = sortedRows.filter(r => !favorites.has(r.sym));
    return favs.length ? [...favs, ...rest] : sortedRows;
  })();

  // En çok yükselen/düşen — yalnız gerçek veri satırları arasında
  const movers = rows.filter(r => !r.bad && r.chg24h != null);
  const topGainer = movers.length ? movers.reduce((a, b) => (b.chg24h > a.chg24h ? b : a)) : null;
  const topLoser = movers.length ? movers.reduce((a, b) => (b.chg24h < a.chg24h ? b : a)) : null;

  return (
    <div className="ak-izle">
      {showNudge && (
        <div className="ak-nudge">
          <span>Cihazlar arası senkron için giriş yap — liste şu an yalnız bu cihazda saklanıyor.</span>
          <div className="ak-nudge-btns">
            <button className="ak-btn ak-btn-primary sm" onClick={() => requireAuth("Cihazlar arası senkron için giriş yap.")}>Giriş yap</button>
            <button className="ak-nudge-x" onClick={dismissNudge} aria-label="Kapat"><X size={15} /></button>
          </div>
        </div>
      )}

      <span className="ak-eyebrow">İZLEME LİSTESİ</span>
      <h1>Takibindekiler</h1>
      <p className="ak-izle-lead">Semboller, son fiyat, mini grafik ve "şu an FVG edge'i var mı" rozeti. Liste bu cihazda saklanır.</p>

      <div className="ak-seg" style={{ marginBottom: 16 }}>
        <button className={section === "izleme" ? "on" : ""} onClick={() => setSection("izleme")}><Eye size={13} /> İzleme Listesi</button>
        <button className={section === "portfoy" ? "on" : ""} onClick={() => setSection("portfoy")}><Wallet size={13} /> Portföy</button>
      </div>

      {section === "portfoy" ? <PortfolioPanel /> : (<>

      {(topGainer || topLoser) && (
        <div className="ak-movers">
          {topGainer && <span className="up">▲ En çok yükselen: <b>{topGainer.sym}</b> {topGainer.chg24h >= 0 ? "+" : ""}{topGainer.chg24h.toFixed(2)}%</span>}
          {topLoser && <span className="dn">▼ En çok düşen: <b>{topLoser.sym}</b> {topLoser.chg24h >= 0 ? "+" : ""}{topLoser.chg24h.toFixed(2)}%</span>}
        </div>
      )}

      <div className="ak-izle-notify">
        <button
          className="ak-btn ak-btn-secondary sm"
          onClick={enableNotify}
          disabled={notifyPerm === "granted" || notifyPerm === "unsupported"}
        >
          {notifyPerm === "granted" ? <><BellRing size={14} /> Bildirimler açık</> : <><Bell size={14} /> Bildirimleri Aç</>}
        </button>
        <button className="ak-btn ak-btn-secondary sm" onClick={() => setShowSettings(v => !v)}>
          <Settings size={14} /> {system.name || "Sistemim"}
        </button>
        <span className="ak-izle-notify-note">"{system.name || "Sistemim"}" kuralına uyan sinyal oluşunca, yalnız bu sekme açıkken bildirim gelir.</span>
      </div>

      {showSettings && (
        <div className="ak-sys-panel">
          <p className="ak-sys-warn">Bu SİZİN ayarlarınız, yalnızca bu tarayıcıda saklanır — başka hiçbir kullanıcı sizinkini görmez. Varsayılan değerler geçmişte doğrulanmış bir <b>başlangıç şablonudur</b>, resmi Altınkulak tavsiyesi değildir.</p>
          <label className="ak-sys-field">
            <span>Sistem adı</span>
            <input type="text" value={system.name || ""} onChange={e => setParam("name", e.target.value)} placeholder="Sistemim" maxLength={40} />
          </label>
          <label className="ak-sys-field">
            <span>ATR çarpanı (FVG sıkılığı) — {system.maxGapAtr.toFixed(2)}</span>
            <input type="range" min="0.1" max="1" step="0.05" value={system.maxGapAtr} onChange={e => setParam("maxGapAtr", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>Risk (R = ATR14 × ) — {system.riskMult.toFixed(1)}</span>
            <input type="range" min="0.5" max="4" step="0.1" value={system.riskMult} onChange={e => setParam("riskMult", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>EMA periyodu — {system.emaPeriod}</span>
            <input type="range" min="10" max="200" step="5" value={system.emaPeriod} onChange={e => setParam("emaPeriod", Number(e.target.value))} />
          </label>
          <label className="ak-sys-field">
            <span>Fib/OTE seviyesi — {system.fibLevel.toFixed(3)}</span>
            <input type="range" min="0.5" max="0.786" step="0.001" value={system.fibLevel} onChange={e => setParam("fibLevel", Number(e.target.value))} />
          </label>
          <button className="ak-btn ak-btn-secondary sm" onClick={resetSystem}>Varsayılana dön</button>
        </div>
      )}

      <div className="ak-izle-add">
        <input list="ak-wsyms" placeholder="Sembol ekle (SOL, NVDA, GARAN…)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <datalist id="ak-wsyms">{searchSymbols.map(s => <option key={s.sym} value={s.sym}>{s.name}</option>)}</datalist>
        <button className="ak-btn ak-btn-primary" onClick={add}><Plus size={15} /> Ekle</button>
      </div>

      {rows.length > 0 && (
        <div className="ak-seg" style={{ marginBottom: 10 }}>
          <button className={sortMode === "varsayilan" ? "on" : ""} onClick={() => setSortMode("varsayilan")}>Varsayılan</button>
          <button className={sortMode === "az" ? "on" : ""} onClick={() => setSortMode("az")}>A-Z</button>
          <button className={sortMode === "chg24h" ? "on" : ""} onClick={() => setSortMode("chg24h")}>24s Değişim</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ak-izle-empty"><Eye size={26} /><p>Liste boş. Sembol ekle.</p></div>
      ) : (
        <div className="ak-izle-list">
          {pinnedRows.map(r => r.bad ? (
            <div className="ak-wrow bad" key={r.sym}>
              <button className={"ak-fav" + (favorites.has(r.sym) ? " on" : "")} onClick={() => toggleFav(r.sym)} title={favorites.has(r.sym) ? "Favorilerden çıkar" : "Favorile"}><Star size={14} fill={favorites.has(r.sym) ? "currentColor" : "none"} /></button>
              <span className="sy">{r.sym}</span><span className="nm">veri yok — Binance'te {r.sym}USDT bulunamadı, sentetik profili de tanımlı değil</span><button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button></div>
          ) : (
            <div className="ak-wrow" key={r.sym}>
              <button className={"ak-fav" + (favorites.has(r.sym) ? " on" : "")} onClick={() => toggleFav(r.sym)} title={favorites.has(r.sym) ? "Favorilerden çıkar" : "Favorile"}><Star size={14} fill={favorites.has(r.sym) ? "currentColor" : "none"} /></button>
              <div className="ak-wid"><span className="sy">{r.sym}</span><span className="nm">{r.name} · {r.group} <i className={"src" + (r.real ? " real" : "")}>{r.real ? "● gerçek" : "○ örnek"}</i>{r.fresh && <i className={"fresh " + r.fresh.status}>{freshnessLabel(r.fresh)}</i>}</span></div>
              <Spark sym={r.sym} />
              <span className="last">{fmtP(r.last)}</span>
              <span className={"chg " + (r.chg >= 0 ? "pos" : "neg")}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
              <span className={"edge " + (r.edge ? "on" : "")}>{r.edge ? <><ShieldCheck size={12} /> edge t={r.t}</> : `t=${r.t}`}</span>
              <button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <p className="ak-izle-note">● = gerçek veri (Binance 4H — listedeki HERHANGİ bir kripto sembolü SEMBOL+USDT olarak denenir) · ○ = örnek veri. Edge rozeti geçmiş 900 barın ölçümüdür, gelecek vaadi ve yatırım tavsiyesi değildir.</p>

      {signals.length > 0 && (
        <div className="ak-signals">
          <h2>{system.name || "Sistemim"} Sinyalleri <span className="ak-soon">kişisel ayar</span></h2>
          <div className="ak-signal-list">
            {signals.map((s) => (
              <div className={"ak-signal-row " + (s.dir === 1 ? "long" : "short")} key={s.id}>
                {s.isNew && <span className="ak-badge-new">YENİ</span>}
                <span className="sy">{s.sym}</span>
                <span className="dir">{s.dir === 1 ? "LONG" : "SHORT"}</span>
                <span className="lv">Giriş <b>{fmtP(s.entry)}</b></span>
                <span className="lv">Stop <b>{fmtP(s.stop)}</b></span>
                <span className="lv">Hedef1 <b>{fmtP(s.hedef1)}</b></span>
                <span className="lv">Hedef2 <b>{fmtP(s.hedef2)}</b></span>
                {timeAgo(s.time) && <span className="ago" title={new Date(s.time).toLocaleString("tr-TR")}>{timeAgo(s.time)}</span>}
              </div>
            ))}
          </div>
          <p className="ak-izle-note">Bu simülasyon/eğitim amaçlıdır; yatırım tavsiyesi değildir, kendi ayarladığınız kişisel kuralın çıktısıdır. Hedef1'de plan %50 kısmi çıkış öngörür.</p>
        </div>
      )}

      {alarmHistory.length > 0 && (
        <div className="ak-signals">
          <h2>Alarm Geçmişi <span className="ak-soon">{alarmHistory.length} kayıt</span></h2>
          <div className="ak-signal-list">
            {alarmHistory.slice(0, 15).map((t) => (
              <div className={"ak-signal-row " + (t.dir === 1 ? "long" : "short")} key={t.id}>
                <span className={"ak-alarm-status " + t.status}>{t.status === "open" ? "Açık" : t.status === "won" ? "Kazandı ✅" : "Kayıp ❌"}</span>
                <span className="sy">{t.sym}</span>
                <span className="dir">{t.dir === 1 ? "LONG" : "SHORT"}</span>
                <span className="lv">Giriş <b>{fmtP(t.entry)}</b></span>
                {t.status !== "open"
                  ? durationLabel(t.openedAt, t.closedAt) && <span className="ago">{durationLabel(t.openedAt, t.closedAt)} sürdü</span>
                  : timeAgo(t.openedAt) && <span className="ago">{timeAgo(t.openedAt)}</span>}
              </div>
            ))}
          </div>
          <p className="ak-izle-note">Sinyal geldiğinde otomatik açılan hayali işlemler — gerçek para değildir, yalnız bu tarayıcıda saklanır.</p>
        </div>
      )}
      </>)}
    </div>
  );
}
