import { useState, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Eye, Plus, Trash2, ShieldCheck, Bell, BellRing, Settings, Star, Wallet, X, Link2, Copy, Check, History, LineChart } from "lucide-react";
import { getBars, loadReal, isReal, hasData, stats24h, getFreshness, getSearchSymbols, loadTop500Symbols, pairFor } from "../lib/data.js";
import { periodChangePct, WEEK_BARS, DETAIL_PERIODS } from "../lib/priceChange.js";
import { getOrComputeHistory } from "../lib/izlemeHistory.js";
import { formatPriceTick } from "../lib/priceFormat.js";
import { fetchWebhookEntry, getOrCreateWebhookEntry, webhookUrlFor, listTriggeredWebhookEntries } from "../lib/izlemeEntries.js";
import { detectModBSignals, DEFAULT_PARAMS, describeConcepts, isSignalPriceSane } from "../lib/modB.js";
import { requestNotifyPermission, notify, isSeen, markSeen } from "../lib/notify.js";
import { addAlarmTrade, checkOpenAlarmTrades, listAlarmTrades, removeAlarmTrade, pruneOldAlarmTrades } from "../lib/alarmTrades.js";
import { seedChartLevels } from "../lib/chartHandoff.js";
import SwipeToDelete from "../components/SwipeToDelete.jsx";
import { useAuth } from "../lib/AuthProvider.jsx";
import { useAuthGate } from "../lib/AuthGate.jsx";
import PortfolioPanel from "../components/PortfolioPanel.jsx";
import { shouldShowNudge, nextNudgeState, loadNudgeState, saveNudgeState } from "../lib/nudge.js";
import "../styles/izleme.css";
import "../styles/portfolio.css"; // AK-089: watchlist detay modalı ak-pf-detail-* sınıflarını PortfolioPanel'le PAYLAŞIR (görsel tutarlılık, aynı CSS ikinci kez tanımlanmaz)

const WKEY = "ak_watch_v1";
const SKEY = "ak_my_system_v1";
const BADGE_KEY = "ak_seen_signal_ids_v1"; // AK-052: notify.js'teki isSeen/markSeen'den ayrı — sadece "YENİ" rozeti için
const FAV_KEY = "ak_favorites_v1"; // AK-061: Lab.jsx sembol seçiciyle paylaşılan aynı anahtar
// AK-izleme-toggle: "Geçmiş veriyi göster" — hangi semboller için kullanıcı backtest'i
// açık bırakmış (default KAPALI — izlemeye eklemek artık otomatik backtest tetiklemiyor).
const HISTORY_ON_KEY = "ak_watch_history_on_v1";
const POLL_MS = 5 * 60 * 1000; // 5 dakika
function load() { try { return JSON.parse(localStorage.getItem(WKEY)) || ["BTC", "ETH", "SOL", "AVAX"]; } catch { return ["BTC"]; } }
function loadFavorites() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { return new Set(); } }
function loadHistoryOn() { try { return new Set(JSON.parse(localStorage.getItem(HISTORY_ON_KEY)) || []); } catch { return new Set(); } }
function loadSystem() {
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY));
    // AK-102: historyDays — Alarm Geçmişi'nde "kaç gün öncesine kadar göster" filtresi. modB.js'in
    // DEFAULT_PARAMS'ına BİLEREK eklenmedi (o sinyal ÜRETİM parametreleri, bu salt bir GÖRÜNTÜLEME
    // filtresi) — 0 = tümü (varsayılan, filtre uygulanmadığında ESKİ davranışla birebir aynı).
    // concepts DEFAULT_PARAMS'tan geliyor (modB.js) — []=hiçbiri seçili değil, eski davranış.
    if (saved && typeof saved === "object") return { name: "Sistemim", historyDays: 0, ...DEFAULT_PARAMS, ...saved };
  } catch {}
  return { name: "Sistemim", historyDays: 0, ...DEFAULT_PARAMS };
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

function fmtPctSigned(v) {
  if (v == null) return "— veri yok";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// AK-089: izleme listesi satırına dokunma → detay ekranı. PortfolioPanel.jsx'in AssetDetailModal'ı
// (AK-079) ile AYNI CSS sınıflarını (ak-pf-detail-*) kullanır — görsel dil tekrar icat edilmez.
// Sekmeler (Geçmiş/Maliyet) burada YOK: bu bir HOLDING değil, salt izlenen bir sembol — o sekmeler
// bir portföy kalemine ait geçmiş/maliyet verisine dayanır, izleme listesinde karşılığı yok.
// YTD/1Y/5Y de eklenmedi — DETAIL_PERIODS zaten AK-031 dürüstlük kararına göre veriye sığan
// aralıklarla sınırlı (bkz. src/lib/priceChange.js).
function WatchDetailModal({ row, fmtP, onClose, userId, requireAuth, onToggleHistory }) {
  const [period, setPeriod] = useState("1G");
  const bars = getBars(row.sym);
  const weekChangePct = periodChangePct(bars, WEEK_BARS);
  const periodDef = DETAIL_PERIODS.find((p) => p.key === period) || DETAIL_PERIODS[0];
  const periodChg = periodChangePct(bars, periodDef.bars);

  // AK-FVG-panel: "Code'a bağla" — bu izleme kaydına özel Pine alert webhook'u.
  // D16: yalnız bu kaydın kendi durumunu okur/günceller, işlem/oyun katmanına karışmaz.
  const [webhook, setWebhook] = useState(null); // null = henüz sorulmadı/yok
  const [whBusy, setWhBusy] = useState(false);
  const [whErr, setWhErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let on = true;
    if (userId) fetchWebhookEntry(userId, row.sym).then((e) => { if (on) setWebhook(e); });
    return () => { on = false; };
  }, [userId, row.sym]);

  async function connectWebhook() {
    if (!requireAuth("\"Code'a bağla\" için giriş yap.")) return;
    setWhBusy(true); setWhErr("");
    const { entry, error } = await getOrCreateWebhookEntry(userId, row.sym);
    setWhBusy(false);
    // AK-webhook-teşhis-2: artık genel "tekrar dene" yerine gerçek sebep gösterilir (varsa)
    if (!entry) { setWhErr(error || "Bağlantı oluşturulamadı — tekrar dene."); return; }
    setWebhook(entry);
  }
  async function copyUrl(url) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setWhErr("Kopyalanamadı — linki elle seç."); }
  }

  return (
    <div className="ak-pf-modal-ov" onClick={onClose}>
      <div className="ak-pf-modal ak-pf-detail" onClick={(e) => e.stopPropagation()}>
        <div className="ak-pf-modal-head">
          <h3>{row.sym} <i className="ak-pf-detail-type">{row.group}</i></h3>
          <button className="ak-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ak-pf-detail-price">
          <b>{fmtP(row.last)}</b>
          <div className="ak-pf-detail-chglines">
            <span className={row.chg >= 0 ? "pos" : "neg"}>Bugün {fmtPctSigned(row.chg)}</span>
            <span className={weekChangePct == null ? "" : weekChangePct >= 0 ? "pos" : "neg"}>Bu hafta {fmtPctSigned(weekChangePct)}</span>
          </div>
          {/* D14: cache tazelik etiketi HER ZAMAN görünür — gerçek veri yoksa dürüst boş durum (D6), gizlenmez */}
          <i className="ak-pf-age">{row.fresh ? freshnessLabel(row.fresh) : "Örnek veri — canlı önbellek yok"}</i>
        </div>

        <div className="ak-pf-detail-periods">
          {DETAIL_PERIODS.map((p) => (
            <button key={p.key} className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        <p className={"ak-pf-detail-periodchg " + (periodChg == null ? "" : periodChg >= 0 ? "pos" : "neg")}>
          {periodDef.label} değişim: {fmtPctSigned(periodChg)}
        </p>

        <div className="ak-pf-detail-grid">
          <div><span className="k">Kaynak</span><b>{row.real ? "Gerçek veri" : "Örnek veri"}</b></div>
          <div><span className="k">Grup</span><b>{row.group}</b></div>
          {/* D19: t<2 ise bu FVG kuralı henüz doğrulanmış "strateji" değil — HİPOTEZ etiketi asla kalkmaz */}
          {row.showHistory && <div><span className="k">Edge (t-stat)</span><b className="mono">{row.edge ? "✓ " : row.hipotez ? "⚠ HİPOTEZ · " : ""}t={row.t}</b></div>}
          {row.showHistory && row.sig && <div><span className="k">Giriş (FVG)</span><b className="mono">{formatPriceTick(row.sig.entry, row.pair)}</b></div>}
          {row.showHistory && row.sig && <div><span className="k">Hedef (TP)</span><b className="mono">{formatPriceTick(row.sig.tp, row.pair)}</b></div>}
          {row.showHistory && row.sig && <div><span className="k">Stop (SL)</span><b className="mono">{formatPriceTick(row.sig.sl, row.pair)}</b></div>}
          {row.showHistory && row.sig && timeAgo(row.sig.timestamp) && <div><span className="k">Sinyal zamanı</span><b>{timeAgo(row.sig.timestamp)}</b></div>}
        </div>

        {/* AK-izleme-toggle: izlemede olmak ile geçmiş veri/backtest hesaplanması artık AYRI — bu
            anahtar açılmadan runBacktest hiç çağrılmaz (D14: hesaplanma anı her zaman görünür). */}
        <div className="ak-history-toggle-row">
          <button className="ak-btn ak-btn-secondary sm" onClick={() => onToggleHistory(row.sym)}>
            <History size={14} /> {row.showHistory ? "Geçmiş veriyi gizle" : "Geçmiş veriyi göster"}
          </button>
          {row.showHistory && (
            <span className="ak-izle-note" style={{ margin: 0 }}>
              {row.historyComputedAt ? `Hesaplandı: ${timeAgo(row.historyComputedAt) || "az önce"}` : ""}
            </span>
          )}
        </div>
        {!row.showHistory && <p className="ak-izle-note">Geçmiş veri/backtest gösterilmiyor — yukarıdaki anahtarla aç (yalnız o zaman hesaplanır).</p>}
        {row.showHistory && !row.sig && <p className="ak-izle-note">Son 900 barda tamamlanmış bir FVG işlemi yok — gösterilecek giriş/TP/SL henüz oluşmadı.</p>}
        {row.showHistory && <p className="ak-izle-note">Edge rozeti geçmiş 900 barın ölçümüdür, gelecek vaadi/yatırım tavsiyesi değildir. Giriş/TP/SL geçmiş simülasyondur, yatırım tavsiyesi değildir.</p>}

        <div className="ak-webhook">
          <h4><Link2 size={13} /> Code'a bağla <span className="ak-soon">Kaynak: Pine Code</span></h4>
          <p className="ak-izle-note">Bu linki TradingView alert'inin webhook alanına yapıştır. Tetiklendiğinde bu kart "tetiklendi" rozetiyle güncellenir — otomatik işlem/pozisyon AÇILMAZ. Bu, platformun kendi Avcı kuralından (Alarm Geçmişi) AYRI bir kaynaktır — kendi alert'ine bağlısın.</p>
          {!webhook ? (
            <button className="ak-btn ak-btn-secondary sm" onClick={connectWebhook} disabled={whBusy}>
              <Link2 size={14} /> {whBusy ? "Bağlanıyor…" : "Code'a bağla"}
            </button>
          ) : (
            <>
              {webhookUrlFor(webhook.webhook_token) ? (
                <div className="ak-webhook-url">
                  <code>{webhookUrlFor(webhook.webhook_token)}</code>
                  <button className="ak-icon" onClick={() => copyUrl(webhookUrlFor(webhook.webhook_token))} title="Kopyala">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              ) : (
                <p className="ak-izle-note">Sunucu bağlantısı yapılandırılmamış — webhook URL'i şu an gösterilemiyor.</p>
              )}
              {/* D14/AK-webhook-teşhis: bağlantı durumu (başarı VEYA hata) her zaman görünür, sessiz başarısızlık yok */}
              <span className={"ak-webhook-badge " + webhook.webhook_status}>
                {webhook.webhook_status === "tetiklendi"
                  ? `Tetiklendi${timeAgo(webhook.last_triggered_at ? new Date(webhook.last_triggered_at).getTime() : null) ? " · " + timeAgo(new Date(webhook.last_triggered_at).getTime()) : ""}`
                  : webhook.webhook_status === "hata"
                    ? `Hata: ${webhook.last_error === "payload_too_large" ? "Pine alert mesajı çok büyük — kısalt ve tekrar dene" : webhook.last_error || "bilinmeyen"}${timeAgo(webhook.last_failed_at ? new Date(webhook.last_failed_at).getTime() : null) ? " · " + timeAgo(new Date(webhook.last_failed_at).getTime()) : ""}`
                    : "Bağlandı, henüz tetiklenmedi"}
              </span>
            </>
          )}
          {whErr && <p className="ak-izle-note bad">{whErr}</p>}
        </div>
      </div>
    </div>
  );
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
  // AK-085/C1: gruplu görünüm — Kripto/BIST/ABD karışık düz liste yerine bölümlenmiş.
  const [groupFilter, setGroupFilter] = useState("Tümü");
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ak_watch_collapsed_v1") || "[]")); }
    catch { return new Set(); }
  });
  function toggleGroup(g) {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(g) ? n.delete(g) : n.add(g);
      try { localStorage.setItem("ak_watch_collapsed_v1", JSON.stringify([...n])); } catch { /* sessiz */ }
      return n;
    });
  }
  const [favorites, setFavorites] = useState(loadFavorites); // AK-061: favori semboller, listenin en üstüne sabitlenir
  // AK-izleme-toggle: "Geçmiş veriyi göster" — default KAPALI, sembol izlemeye eklenince
  // hiçbir backtest/geçmiş veri hesabı tetiklenmez (yalnız bu Set'e girmiş semboller için hesaplanır).
  const [historyOn, setHistoryOn] = useState(loadHistoryOn);
  const [detailSym, setDetailSym] = useState(null); // AK-089: satıra dokunma → detay ekranı (WatchDetailModal)
  // AK-103: 80+ gün önce KAPANMIŞ kayıtlar sayfa her açıldığında bir kez budanır (açık kayıtlara
  // dokunulmaz). Sicil ledger'ın append-only kuralı BURAYA uygulanmaz — bu, gerçek para/istatistik
  // taşımayan, salt bu tarayıcıdaki bir bildirim geçmişidir (bkz. alarmTrades.js üstündeki not).
  const [alarmHistory, setAlarmHistory] = useState(() => { pruneOldAlarmTrades(); return listAlarmTrades(); });
  function deleteAlarmTrade(id) {
    if (removeAlarmTrade(id)) setAlarmHistory(listAlarmTrades());
  }
  // AK-102: Pine Code Tetiklenmeleri — Alarm Geçmişi'nden AYRI kaynak (platformun kendi Avcı
  // kuralı değil, kullanıcının KENDİ TradingView alert'i). Yalnız girişliyken vardır (webhook
  // Supabase'te tutulur, D6 — girişsizken/yapılandırılmamışken zaten boş dizi döner).
  const [pineTriggers, setPineTriggers] = useState([]);
  useEffect(() => {
    let on = true;
    if (user?.id) listTriggeredWebhookEntries(user.id).then((rows) => { if (on) setPineTriggers(rows); });
    else setPineTriggers([]);
    return () => { on = false; };
  }, [user?.id]);
  useEffect(() => { try { localStorage.setItem(WKEY, JSON.stringify(list)); } catch {} }, [list]);
  useEffect(() => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); } catch {} }, [favorites]);
  useEffect(() => { try { localStorage.setItem(HISTORY_ON_KEY, JSON.stringify([...historyOn])); } catch {} }, [historyOn]);
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
        // AK-104: hasData() curated semboller (BTC/ETH/.../BNB) için sentetik yedeği de "veri
        // var" sayar — gerçek Binance isteği henüz dönmeden Avcı bu fabrike, start=100'den
        // sürüklenen fiyatlarla sinyal üretip bildirim gönderiyordu (AK-101'de PortfolioPanel'de
        // bulunanla AYNI hata sınıfı — BNB/TRX/DOGE'nin İzleme'deki gerçek fiyattan tamamen
        // farklı görünen Giriş/Stop/Hedef değerlerinin kök nedeni). isReal() yalnız GERÇEK
        // Binance verisi geldiyse true döner — Avcı asla sentetik/demo veriden sinyal üretmez.
        if (!isReal(sym)) continue;
        const b = getBars(sym);
        if (!b || b.length < 60) continue;
        barsBySym[sym] = b;
        // AK-104 sağlık kontrolü: isReal() gate'i asıl savunma — bu yalnız son bir güvenlik ağı,
        // sinyal fiyatı canlı fiyattan %50+ sapıyorsa (bir hata belirtisi) sessizce filtrelenir.
        const livePrice = b[b.length - 1].c;
        const sigs = detectModBSignals(b, sym, system).filter((s) => {
          if (isSignalPriceSane(s.entry, livePrice)) return true;
          console.warn(`[Avcı sağlık kontrolü] ${sym} sinyali canlı fiyattan aşırı sapıyor, filtrelendi — entry=${s.entry} canlı=${livePrice}`);
          return false;
        });
        all.push(...sigs);
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

  // AK-102: "kaç gün öncesine kadar göster" — 0/tümü ise ESKİ davranış birebir korunur (filtre yok).
  const filteredAlarmHistory = system.historyDays > 0
    ? alarmHistory.filter((t) => t.openedAt >= Date.now() - system.historyDays * 86400000)
    : alarmHistory;

  // AK-102: "grafikte gör" — bu sinyalin giriş/TP/SL seviyelerini Lab.jsx'in grafiğine ekler
  // (Chart.jsx'in KENDİ çizim aracı yeniden kullanılır, bkz. src/lib/chartHandoff.js). Bar indeksi
  // olarak elimizdeki en güncel barlardan biri seçilir — orijinal sinyal barının TAM karşılığı
  // değildir (semboller sürekli yeni bar aldığı için eski indeks kaymış olabilir), önemli olan
  // fiyat SEVİYELERİnin doğru gösterilmesidir.
  function openAlarmInChart(t) {
    const bars = getBars(t.sym);
    const anchorIdx = Math.max(0, (bars?.length || 1) - 5);
    seedChartLevels(t.sym, anchorIdx, { entry: t.entry, stop: t.stop, hedef1: t.hedef1, hedef2: t.hedef2 });
  }

  function add() { const s = q.trim().toUpperCase(); if (s && !list.includes(s)) setList(l => [...l, s]); setQ(""); }
  function del(s) { setList(l => l.filter(x => x !== s)); }
  function setParam(key, val) { setSystem(s => ({ ...s, [key]: val })); }
  function resetSystem() { setSystem({ name: "Sistemim", historyDays: 0, ...DEFAULT_PARAMS }); }
  // AK-102: concept checkbox'ları — dizide varsa çıkar, yoksa ekle.
  function toggleConcept(key) {
    setSystem(s => {
      const cur = s.concepts || [];
      return { ...s, concepts: cur.includes(key) ? cur.filter(c => c !== key) : [...cur, key] };
    });
  }
  function toggleFav(sym) { setFavorites(f => { const n = new Set(f); n.has(sym) ? n.delete(sym) : n.add(sym); return n; }); }
  function toggleHistory(sym) { setHistoryOn(h => { const n = new Set(h); n.has(sym) ? n.delete(sym) : n.add(sym); return n; }); }

  const rows = list.map(sym => {
    if (!hasData(sym)) return { sym, bad: true }; // ne gerçek ne tanımlı sentetik -> "veri yok" (sahte edge yakma!)
    const b = getBars(sym);
    if (!b || b.length < 60) return { sym, bad: true };
    const last = b[b.length - 1].c, prev = b[b.length - 2].c, chg = ((last - prev) / prev) * 100;
    const meta = searchSymbols.find(x => x.sym === sym);
    const real = isReal(sym);
    // AK-057: 24s değişim yalnız gerçek veride anlamlı — sentetikte null (sıralama dışı kalır)
    const chg24h = real ? stats24h(b)?.chgPct ?? null : null;
    const fresh = real ? getFreshness(sym) : null; // AK-064: "Binance'e bağlı · X gecikme" rozeti

    // AK-izleme-toggle: SORUN — izlemeye eklemek ile backtest hesabı birbirine bağlıydı (bir
    // sembol eklenince runBacktest hemen otomatik çalışıyordu). Artık motor YALNIZ kullanıcı bu
    // sembol için "Geçmiş veriyi göster"ı AÇTIYSA çağrılır; cache tazeyse (son kapanmış 4H
    // mumundan yeniyse) yeniden de hesaplanmaz (bkz. src/lib/izlemeHistory.js).
    const showHistory = historyOn.has(sym);
    const hist = showHistory
      ? getOrComputeHistory(sym, b, { rr: 2, maxGapATR: 0.6, concepts: ["fvg"], costR: 0.05 })
      : null;
    const t = hist?.result?.t ?? null;
    const edge = hist?.result?.edge ?? false;
    const hipotez = hist?.result?.hipotez ?? false; // D19: t<2 → hipotez, "strateji" değil
    const sig = hist?.result?.sig ?? null;
    return {
      sym, name: meta?.name || sym, group: meta?.group || "—", real, last, chg, chg24h, fresh,
      showHistory, t, edge, hipotez, sig, historyComputedAt: hist?.computedAt ?? null,
      pair: pairFor(sym),
    };
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

  // AK-085/C1: gruplu görünüm. Satırlar grup etiketine bölünür (veri-yok satırlar "Diğer"),
  // grup içi sıra pinnedRows'tan (favori üstte + seçili sıralama) aynen korunur.
  const GROUP_ORDER = ["Kripto", "BIST", "ABD", "Avrupa", "Kontrol", "Diğer"];
  const grouped = (() => {
    const m = new Map();
    for (const r of pinnedRows) {
      const g = r.bad ? "Diğer" : (r.group && r.group !== "—" ? r.group : "Diğer");
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    }
    return GROUP_ORDER.filter(g => m.has(g)).map(g => ({ g, rows: m.get(g) }));
  })();
  const presentGroups = grouped.map(x => x.g);
  const visibleGroups = groupFilter === "Tümü" ? grouped : grouped.filter(x => x.g === groupFilter);

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
          <Settings size={14} /> {system.name || "Sistemim"} <span className="ak-sys-concept-badge">{describeConcepts(system.concepts)}</span>
        </button>
        <span className="ak-izle-notify-note">"{system.name || "Sistemim"}" ({describeConcepts(system.concepts)}) kuralına uyan sinyal oluşunca, yalnız bu sekme açıkken bildirim gelir.</span>
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

          {/* AK-102: OB/BOS/Mitigation/Order Flow/Fibonacci — bunlar FVG'nin YERİNE geçen ayrı
              sinyal kaynakları DEĞİL (Lab.jsx'in backtest motöründe de öyle çalışmıyor); seçilen
              her kavram, mevcut FVG girişine EK bir "buna da uysun" şartı ekler. Hiçbiri seçili
              değilken (varsayılan) davranış birebir eskisiyle aynıdır. */}
          <div className="ak-sys-field">
            <span>Ek onay şartı (opsiyonel — hiçbiri seçili değilse davranış değişmez)</span>
            <div className="ak-sys-concepts">
              {[
                ["ob", "Order Block"], ["bos", "BOS"], ["mit", "Mitigation"],
                ["of", "Order Flow"], ["fib", "Fibonacci (indirim/prim)"],
              ].map(([key, label]) => (
                <label key={key} className="ak-sys-concept-chip">
                  <input type="checkbox" checked={(system.concepts || []).includes(key)} onChange={() => toggleConcept(key)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <label className="ak-sys-field">
            <span>Alarm Geçmişi'nde kaç gün öncesine kadar göster — {system.historyDays > 0 ? `${system.historyDays} gün` : "tümü"}</span>
            <input type="range" min="0" max="180" step="10" value={system.historyDays || 0} onChange={e => setParam("historyDays", Number(e.target.value))} />
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
        <>
          {/* AK-085/C1: grup filtresi — çipler yalnız listede fiilen VAR olan gruplardan oluşur */}
          {presentGroups.length > 1 && (
            <div className="ak-seg" style={{ marginBottom: 10 }}>
              <button className={groupFilter === "Tümü" ? "on" : ""} onClick={() => setGroupFilter("Tümü")}>Tümü</button>
              {presentGroups.map(g => (
                <button key={g} className={groupFilter === g ? "on" : ""} onClick={() => setGroupFilter(g)}>{g}</button>
              ))}
            </div>
          )}
          <div className="ak-izle-list">
            {visibleGroups.map(({ g, rows: groupRows }) => (
              <div key={g}>
                <button
                  className="ak-group-head"
                  onClick={() => toggleGroup(g)}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", cursor: "pointer", padding: "10px 2px 4px", color: "inherit", opacity: 0.75, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  <span style={{ transform: collapsed.has(g) ? "rotate(-90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▾</span>
                  {g} <span style={{ opacity: 0.6 }}>({groupRows.length})</span>
                </button>
                {!collapsed.has(g) && groupRows.map(r => r.bad ? (
                  <div className="ak-wrow bad" key={r.sym}>
                    <button className={"ak-fav" + (favorites.has(r.sym) ? " on" : "")} onClick={() => toggleFav(r.sym)} title={favorites.has(r.sym) ? "Favorilerden çıkar" : "Favorile"}><Star size={14} fill={favorites.has(r.sym) ? "currentColor" : "none"} /></button>
                    <span className="sy">{r.sym}</span><span className="nm">veri yok — Binance'te {r.sym}USDT bulunamadı, sentetik profili de tanımlı değil</span><button className="ak-del" onClick={() => del(r.sym)}><Trash2 size={14} /></button></div>
                ) : (
                  <div className="ak-wrow" key={r.sym} onClick={() => setDetailSym(r.sym)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setDetailSym(r.sym)}>
                    <button className={"ak-fav" + (favorites.has(r.sym) ? " on" : "")} onClick={(e) => { e.stopPropagation(); toggleFav(r.sym); }} title={favorites.has(r.sym) ? "Favorilerden çıkar" : "Favorile"}><Star size={14} fill={favorites.has(r.sym) ? "currentColor" : "none"} /></button>
                    <div className="ak-wid"><span className="sy">{r.sym}</span><span className="nm">{r.name} <i className={"src" + (r.real ? " real" : "")}>{r.real ? "● gerçek" : "○ örnek"}</i>{r.fresh && <i className={"fresh " + r.fresh.status}>{freshnessLabel(r.fresh)}</i>}</span></div>
                    <Spark sym={r.sym} />
                    <span className="last">{fmtP(r.last)}</span>
                    <span className={"chg " + (r.chg >= 0 ? "pos" : "neg")}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span>
                    {r.showHistory ? (
                      <span className={"edge " + (r.edge ? "on" : "")}>{r.edge ? <><ShieldCheck size={12} /> edge t={r.t}</> : r.hipotez ? `hipotez t=${r.t}` : `t=${r.t}`}</span>
                    ) : (
                      <button className="ak-history-btn" onClick={(e) => { e.stopPropagation(); toggleHistory(r.sym); }} title="Geçmiş veri/backtest hesapla">
                        <History size={12} /> Geçmiş veri
                      </button>
                    )}
                    <button className="ak-del" onClick={(e) => { e.stopPropagation(); del(r.sym); }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      <p className="ak-izle-note">● = gerçek veri (Binance 4H — listedeki HERHANGİ bir kripto sembolü SEMBOL+USDT olarak denenir) · ○ = örnek veri. Edge rozeti geçmiş 900 barın ölçümüdür, gelecek vaadi ve yatırım tavsiyesi değildir.</p>

      {signals.length > 0 && (
        <div className="ak-signals">
          <h2>{system.name || "Sistemim"} Sinyalleri <span className="ak-soon">{describeConcepts(system.concepts)}</span> <span className="ak-soon">kişisel ayar</span></h2>
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
          <h2>Alarm Geçmişi <span className="ak-soon">Kaynak: Avcı · {describeConcepts(system.concepts)}</span> <span className="ak-soon">{filteredAlarmHistory.length} kayıt</span></h2>
          <div className="ak-signal-list">
            {filteredAlarmHistory.slice(0, 15).map((t) => (
              <SwipeToDelete key={t.id} deleteLabel={`${t.sym} kaydını sil`} onDelete={() => deleteAlarmTrade(t.id)}>
                <div className={"ak-signal-row " + (t.dir === 1 ? "long" : "short")}>
                  <span className={"ak-alarm-status " + t.status}>{t.status === "open" ? "Açık" : t.status === "won" ? "Kazandı ✅" : "Kayıp ❌"}</span>
                  <span className="sy">{t.sym}</span>
                  <span className="dir">{t.dir === 1 ? "LONG" : "SHORT"}</span>
                  <span className="lv">Giriş <b>{fmtP(t.entry)}</b></span>
                  {/* AK-102: TP1/TP2 her zaman referans olarak görünür; TP2'ye o an ELİMİZDEKİ
                      barlarla ulaşıldığı doğrulandıysa (hitHedef2) yeşil ✓ — dürüst sınır: veri
                      kapanış sonrası biterse hedef2'ye sonradan ulaşılmış olsa bile bilinemez. */}
                  <span className="lv">TP1 <b className={t.status === "won" ? "pos" : ""}>{fmtP(t.hedef1)}</b></span>
                  {t.hedef2 != null && (
                    <span className="lv">TP2 <b className={t.hitHedef2 ? "pos" : ""}>{fmtP(t.hedef2)}{t.status === "won" && (t.hitHedef2 ? " ✓" : " (henüz)")}</b></span>
                  )}
                  {t.status === "lost" && <span className="lv">SL <b className="neg">{fmtP(t.stop)}</b></span>}
                  <RouterLink className="ak-icon ak-alarm-chartlink" title="Grafikte gör" to={`/lab?sym=${t.sym}`} onClick={() => openAlarmInChart(t)}>
                    <LineChart size={14} />
                  </RouterLink>
                  {t.status !== "open"
                    ? durationLabel(t.openedAt, t.closedAt) && <span className="ago">{durationLabel(t.openedAt, t.closedAt)} sürdü</span>
                    : timeAgo(t.openedAt) && <span className="ago">{timeAgo(t.openedAt)}</span>}
                </div>
              </SwipeToDelete>
            ))}
          </div>
          <p className="ak-izle-note">Sinyal geldiğinde otomatik açılan hayali işlemler — gerçek para değildir, yalnız bu tarayıcıda saklanır. Kaynak: platformun kendi Avcı kuralı (Pine Code webhook tetiklenmeleri ayrı bölümde).</p>
        </div>
      )}

      {/* AK-102: Alarm Geçmişi ile KARIŞTIRILMASIN — bu, kullanıcının KENDİ TradingView alert'inden
          webhook ile gelen tetiklenmeler. Platformun Avcı kuralıyla hiçbir ilgisi yok, bilinçli
          olarak ayrı bir bölüm/başlık altında. */}
      {pineTriggers.length > 0 && (
        <div className="ak-signals">
          <h2>Pine Code Tetiklenmeleri <span className="ak-soon">Kaynak: Pine Code</span> <span className="ak-soon">{pineTriggers.length} kayıt</span></h2>
          <div className="ak-signal-list">
            {pineTriggers.slice(0, 15).map((w) => (
              <div className="ak-signal-row" key={w.id}>
                <span className="ak-alarm-status won">Tetiklendi</span>
                <span className="sy">{w.sym}</span>
                {timeAgo(w.last_triggered_at ? new Date(w.last_triggered_at).getTime() : null) && (
                  <span className="ago">{timeAgo(new Date(w.last_triggered_at).getTime())}</span>
                )}
              </div>
            ))}
          </div>
          <p className="ak-izle-note">Kendi TradingView alert'inden webhook ile gelen tetiklenmeler — otomatik işlem/pozisyon açmaz, yalnız bilgilendirir. Alarm Geçmişi (platformun Avcı kuralı) ile karıştırılmasın.</p>
        </div>
      )}

      {detailSym && (() => {
        const row = rows.find((r) => r.sym === detailSym);
        return row && !row.bad ? <WatchDetailModal row={row} fmtP={fmtP} onClose={() => setDetailSym(null)} userId={user?.id} requireAuth={requireAuth} onToggleHistory={toggleHistory} /> : null;
      })()}
      </>)}
    </div>
  );
}
