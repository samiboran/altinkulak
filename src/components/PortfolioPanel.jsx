import { useState, useEffect, useMemo, useRef } from "react";
import { Wallet, Plus, X, ArrowLeftRight, Eye, EyeOff, ArrowUpRight, ArrowDownRight, History, Lock, Bitcoin, Building2, Landmark, LayoutGrid, Calculator, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { getBars, hasData, isReal, loadReal, ALL_SYMBOLS, getSearchSymbols, pairFor } from "../lib/data.js";
import { addTransaction, getItems, listEvents, itemKey, canSubmitTransaction } from "../lib/portfolio.js";
import { getUSStockPrice, getCachedUSStockPrice, getUSStockPriceTimestamp, isUSStockPriceConfigured } from "../lib/usStockPrices.js";
import { recordSnapshotIfNeeded, getSnapshots, dailyReturnPct, weeklyReturnPct, monthlyReturnPct, calendarMonth } from "../lib/portfolioHistory.js";
import { APPROX_USD_TRY, fmtPct, fmtDisplay } from "../lib/portfolioFormat.js";
import { periodChangePct, WEEK_BARS, DETAIL_PERIODS } from "../lib/priceChange.js";
import "../styles/portfolio.css";

// AK-078: İzleme listesi "bak"tan "takip et"e geçiyor — kişisel portföy modülü.
// Bu bileşen SADECE isOwner=true iken Profil.jsx tarafından render edilir (D2 zaten oradan gelir).

const WKEY = "ak_watch_v1"; // Izleme.jsx ile paylaşılan watchlist — Ekle modalında "mevcut watchlist" (U6)
const PRIV_KEY = "ak_portfolio_privacy_v1";
const CUR_KEY = "ak_portfolio_currency_v1";

const TABS = [
  { key: "all", label: "Tümü" },
  { key: "crypto", label: "Kripto" },
  { key: "bist", label: "BIST", locked: true },
  { key: "us", label: "ABD" },
];

function loadWatchlist() { try { return JSON.parse(localStorage.getItem(WKEY)) || []; } catch { return []; } }
function loadBool(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return typeof v === "boolean" ? v : def; } catch { return def; } }
function loadStr(key, def) { try { return localStorage.getItem(key) || def; } catch { return def; } }

// Sembolün ALL_SYMBOLS'teki grubundan varlık tipini çıkarır; bilinmeyen ama kripto-eşleşebilir
// (pairFor) semboller 'crypto' sayılır (data.js'in "bilinmeyen sembol -> SEMBOL+USDT dene" kuralıyla tutarlı).
// BIST'e YENİ ekleme yapılamaz (D10 — tamamen kapalı) — 'bist' dönerse çağıran engellemeli.
function inferAssetType(sym) {
  const meta = ALL_SYMBOLS.find((x) => x.sym === sym.toUpperCase());
  if (meta?.group === "Kripto") return "crypto";
  if (meta?.group === "BIST") return "bist";
  if (meta?.group === "ABD") return "us";
  if (pairFor(sym)) return "crypto";
  return null;
}

const PERIOD_BARS = { "1H": 1, "1A": 180, "1Y": 2190 }; // 4s mum varsayımıyla kaba yaklaşık bar sayısı

// AK-079: TradingView mobil referansı — sembol satırı/başlığında varlık tipine göre ikon.
const ASSET_ICON = { crypto: Bitcoin, us: Building2, bist: Landmark };

// D16: ABD/BIST (kripto DIŞI) fiyatların yanında HER ZAMAN "son güncelleme: X" gösterilir — kaynak
// cache'in KENDİ ts'i (kullanıcının sayfayı açtığı an değil). Kripto gerçek zamanlı ticker olduğu
// için bu etikete ihtiyaç duymaz.
function agoLabel(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 0) return "az önce";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  return `${Math.floor(hr / 24)} gün önce`;
}

function priceOf(item) {
  if (item.asset_type === "crypto") {
    if (hasData(item.symbol)) return getBars(item.symbol)[getBars(item.symbol).length - 1].c;
    return item.avg_cost_usd; // bilinmeyen sembol — fabrika veri yok, maliyete düşer (AK-031 dürüstlük kuralı)
  }
  if (item.asset_type === "us") {
    return getCachedUSStockPrice(item.symbol) ?? item.avg_cost_usd;
  }
  return item.avg_cost_usd; // bist — kilitli, buraya normalde hiç girilmez
}

export default function PortfolioPanel() {
  const [events, setEvents] = useState(() => listEvents());
  const [items, setItems] = useState(() => getItems());
  const [filterTab, setFilterTab] = useState("all");
  const [hideValues, setHideValues] = useState(() => loadBool(PRIV_KEY, false));
  const [currency, setCurrency] = useState(() => loadStr(CUR_KEY, "USD"));
  const [modalOpen, setModalOpen] = useState(false);
  const [detailKey, setDetailKey] = useState(null); // AK-079: satıra tıklayınca açılan zenginleştirilmiş detay ekranı
  const [, setTick] = useState(0); // canlı fiyat gelince yeniden çizim

  useEffect(() => { try { localStorage.setItem(PRIV_KEY, JSON.stringify(hideValues)); } catch {} }, [hideValues]);
  useEffect(() => { try { localStorage.setItem(CUR_KEY, currency); } catch {} }, [currency]);

  // D16: "son güncelleme: X dk önce" etiketi gerçek zamanlı kalsın — fiyat yeniden çekilmese
  // bile geçen süre metni tazelenir (Izleme.jsx'teki AK-048 örüntüsüyle aynı).
  const [, setAgeTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAgeTick((v) => v + 1), 30000);
    return () => clearInterval(id);
  }, []);

  function refresh() {
    setEvents(listEvents());
    setItems(getItems());
  }

  // AK-004b örüntüsü: kripto kalemler için gerçek fiyat arka planda yüklenir
  useEffect(() => {
    let on = true;
    const cryptoSyms = items.filter((i) => i.asset_type === "crypto").map((i) => i.symbol);
    Promise.all(cryptoSyms.map((s) => loadReal(s).catch(() => null))).then((r) => { if (on && r.some(Boolean)) setTick((v) => v + 1); });
    const usSyms = items.filter((i) => i.asset_type === "us").map((i) => i.symbol);
    Promise.all(usSyms.map((s) => getUSStockPrice(s).catch(() => null))).then(() => { if (on) setTick((v) => v + 1); });
    return () => { on = false; };
  }, [items]);

  const rows = useMemo(() => items.map((it) => {
    const price = priceOf(it);
    const value = price * it.qty;
    const costValue = it.avg_cost_usd * it.qty;
    const pnl = value - costValue;
    const pnlPct = costValue ? (pnl / costValue) * 100 : 0;
    let dayChangePct = null, weekChangePct = null;
    if (it.asset_type === "crypto" && hasData(it.symbol)) {
      const b = getBars(it.symbol);
      if (b.length >= 2) dayChangePct = ((b[b.length - 1].c - b[b.length - 2].c) / b[b.length - 2].c) * 100;
      weekChangePct = periodChangePct(b, WEEK_BARS); // AK-079: detay ekranında "haftalık değişim" satırı için
    }
    return { ...it, price, value, costValue, pnl, pnlPct, dayChangePct, weekChangePct };
  }), [items]);

  const filteredRows = filterTab === "all" ? rows : rows.filter((r) => r.asset_type === filterTab);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const totalCost = rows.reduce((a, r) => a + r.costValue, 0);
  const totalPnl = total - totalCost;
  const totalPnlPct = totalCost ? (totalPnl / totalCost) * 100 : 0;

  // D13: "dönemsel fiyat değişimi" — maliyete göre K/Z'den AYRI, girişin ne zaman yapıldığını
  // hesaba katmayan, dürüstçe etiketlenmiş bir metrik (gerçek/basit TWR DEĞİL).
  const perf = useMemo(() => {
    const out = {};
    for (const key of Object.keys(PERIOD_BARS)) {
      let wsum = 0, wtotal = 0, partial = false;
      for (const r of rows) {
        if (r.asset_type !== "crypto" || !hasData(r.symbol)) { if (r.value > 0) partial = true; continue; }
        const chg = periodChangePct(getBars(r.symbol), PERIOD_BARS[key]);
        if (chg == null) { partial = true; continue; }
        wsum += chg * r.value; wtotal += r.value;
      }
      out[key] = { pct: wtotal > 0 ? wsum / wtotal : null, partial };
    }
    return out;
  }, [rows]);

  function handleAdd(payload) {
    const ev = addTransaction(payload);
    if (ev) { refresh(); setModalOpen(false); }
    return ev;
  }

  // AK-101: portföy geçmişi — gerçek sunucu-taraflı gün-sonu cron'u yok (portföy henüz
  // Supabase'e taşınmadı, bkz. AK-099 backlog), bu yüzden istemci tarafında "gün içinde ilk
  // açılış" anı bugünün gün-sonu değeri sayılır. Fiyatlar (özellikle ABD/kripto canlı çekim)
  // mount anında henüz gelmemiş olabileceği için küçük bir gecikmeyle kaydedilir — D14 ruhu:
  // gösterilen değer "o anki son bilinen durum"dur, kusursuz gün sonu değildir.
  const [snapshots, setSnapshots] = useState(() => getSnapshots());
  const totalRef = useRef(total);
  totalRef.current = total;
  useEffect(() => {
    const id = setTimeout(() => {
      if (rows.length === 0) return; // henüz kalem yüklenmediyse boş 0'ı kilitleme
      setSnapshots(recordSnapshotIfNeeded(totalRef.current));
    }, 1500);
    return () => clearTimeout(id);
  }, [rows.length]);

  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const calCells = useMemo(() => calendarMonth(snapshots, calMonth.y, calMonth.m), [snapshots, calMonth]);
  const monthLabel = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <div className="ak-pf">
      <div className="ak-pf-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={(filterTab === t.key ? "on " : "") + (t.locked ? "locked" : "")}
            onClick={() => !t.locked && setFilterTab(t.key)}
            disabled={t.locked}
            title={t.locked ? "Yakında — gecikmeli/lisanslı veri sorunu çözülene kadar kapalı" : undefined}
          >
            {t.label}{t.locked && <span className="ak-soon"><Lock size={9} /> Yakında</span>}
          </button>
        ))}
      </div>

      <div className="ak-pf-head">
        <div className="ak-pf-sum">
          <div><span className="k">Toplam değer</span><b>{fmtDisplay(total, currency, hideValues)}</b></div>
          <div><span className="k">Toplam K/Z</span><b className={totalPnl >= 0 ? "pos" : "neg"}>{fmtDisplay(totalPnl, currency, hideValues)} ({fmtPct(totalPnlPct)})</b></div>
          <div><span className="k">Pozisyon</span><b>{rows.length}</b></div>
        </div>
        <div className="ak-pf-ctl">
          <button className="ak-pf-toggle" onClick={() => setCurrency((c) => (c === "USD" ? "TRY" : "USD"))} title="Görüntüleme birimi — yaklaşık referans kur">
            {currency}
          </button>
          <button className="ak-pf-toggle" onClick={() => setHideValues((v) => !v)} title={hideValues ? "Tutarları göster" : "Gizlilik modu"}>
            {hideValues ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button className="ak-btn ak-btn-primary sm" onClick={() => setModalOpen(true)}><Plus size={15} /> Ekle</button>
        </div>
      </div>
      {currency === "TRY" && <p className="ak-pf-fxnote">₺ değerleri yaklaşık referans kurla (1 USD ≈ {APPROX_USD_TRY}₺) gösteriliyor — canlı kur beslemesi değildir.</p>}

      <div className="ak-pf-perf">
        {Object.entries(perf).map(([key, v]) => (
          <div className="ak-pf-perf-cell" key={key}>
            <span className="lb">{key} fiyat değişimi{v.partial && v.pct != null ? "*" : ""}</span>
            <b className={v.pct == null ? "" : v.pct >= 0 ? "pos" : "neg"}>{v.pct == null ? "veri yok" : fmtPct(v.pct)}</b>
          </div>
        ))}
        <p className="ak-pf-perf-note">Dönemsel fiyat değişimi, mevcut pozisyonların o dönemdeki piyasa hareketidir — ne zaman aldığını hesaba katmaz, "maliyete göre K/Z" (yukarıda) ile karıştırılmamalı. * = bazı kalemler için geçmiş veri yetersiz, kısmi hesaplandı. Yalnız kripto kalemler için hesaplanır.</p>
      </div>

      {filteredRows.length === 0 ? (
        <div className="ak-port-empty"><Wallet size={26} /><p>{filterTab === "all" ? "Portföyün boş." : "Bu kategoride pozisyon yok."} Sembol ekle — değer ve K/Z otomatik hesaplanır. Veriler bu cihazda saklanır.</p></div>
      ) : (
        <div className="ak-pf-table">
          <div className="ak-pf-h"><span>Sembol</span><span>Adet</span><span>Ort. maliyet</span><span>Canlı fiyat</span><span>Değer</span><span>K/Z</span></div>
          {filteredRows.map((r) => {
            const Icon = ASSET_ICON[r.asset_type] || Bitcoin;
            return (
              <div className="ak-pf-r" key={r.key} onClick={() => setDetailKey(r.key)}>
                <span className="sy"><Icon size={14} className="ak-pf-icon" /><span className="sy-txt">{r.symbol}<i className="tu">{r.asset_type === "crypto" ? "Kripto" : r.asset_type === "us" ? "ABD" : "BIST"}</i></span></span>
                <span className="mono">{r.qty}</span>
                <span className="mono">{fmtDisplay(r.avg_cost_usd, currency, hideValues)}</span>
                {/* AK-079: tipografi hiyerarşisi — büyük fiyat üstte, renkli % değişim altta (TradingView mobil referansı) */}
                <span className="mono ak-pf-pricecell">
                  <span className="ak-pf-price">{fmtDisplay(r.price, currency, hideValues)}</span>
                  {r.dayChangePct != null ? (
                    <span className={"ak-pf-daychg " + (r.dayChangePct >= 0 ? "pos" : "neg")}>
                      {r.dayChangePct >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {fmtPct(r.dayChangePct)}
                    </span>
                  ) : r.asset_type !== "crypto" ? (
                    <i className="ak-pf-age" title="Fiyatın kaynak zamanı — sayfayı ne zaman açtığın değil">
                      son güncelleme: {agoLabel(getUSStockPriceTimestamp(r.symbol)) || "—"}
                    </i>
                  ) : null}
                </span>
                <span className="mono">{fmtDisplay(r.value, currency, hideValues)}</span>
                <span className={"mono " + (r.pnl >= 0 ? "pos" : "neg")}>{fmtDisplay(r.pnl, currency, hideValues)} ({fmtPct(r.pnlPct)})</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="ak-port-note">
        Maliyete göre K/Z, ağırlıklı ortalama maliyetine göre hesaplanır. {!isUSStockPriceConfigured() && "ABD hisseleri için canlı fiyat kaynağı yapılandırılmamış — fiyat manuel girilene kadar maliyet gösterilir. "}
        Bu bir portföy takip aracıdır, yatırım tavsiyesi değildir.
      </p>

      {rows.length > 0 && (
        <PortfolioHistorySection snapshots={snapshots} calMonth={calMonth} setCalMonth={setCalMonth} calCells={calCells} monthLabel={monthLabel} />
      )}

      {modalOpen && (
        <AddTransactionModal onClose={() => setModalOpen(false)} onSubmit={handleAdd} watchlist={loadWatchlist()} />
      )}
      {detailKey && (() => {
        const row = rows.find((r) => r.key === detailKey);
        if (!row) return null;
        return (
          <AssetDetailModal
            row={row}
            events={events.filter((e) => e.item_key === detailKey)}
            currency={currency}
            hideValues={hideValues}
            onClose={() => setDetailKey(null)}
          />
        );
      })()}
    </div>
  );
}

// AK-101: Portföy geçmişi — günlük/haftalık/aylık toplam getiri + aylık takvim (her gün bir
// kutucuk, o günün getirisi renk kodlu — D14 "son güncelleme" dürüstlüğüyle tutarlı: veri
// yoksa nötr/boş kutucuk, fabrike sayı yok).
function PortfolioHistorySection({ snapshots, calMonth, setCalMonth, calCells, monthLabel }) {
  const d = dailyReturnPct(snapshots), w = weeklyReturnPct(snapshots), m = monthlyReturnPct(snapshots);
  const leadPad = new Date(calMonth.y, calMonth.m, 1).getDay(); // 0=Pazar — TR takviminde Pazartesi başlangıç için 6 kaydır
  const padCount = (leadPad + 6) % 7;

  function shiftMonth(delta) {
    setCalMonth(({ y, m }) => {
      const d2 = new Date(y, m + delta, 1);
      return { y: d2.getFullYear(), m: d2.getMonth() };
    });
  }

  return (
    <div className="ak-pf-history">
      <div className="ak-pf-history-sum">
        <div><span className="k">Günlük</span><b className={d == null ? "" : d >= 0 ? "pos" : "neg"}>{d == null ? "veri yok" : fmtPct(d)}</b></div>
        <div><span className="k">Haftalık</span><b className={w == null ? "" : w >= 0 ? "pos" : "neg"}>{w == null ? "veri yok" : fmtPct(w)}</b></div>
        <div><span className="k">Aylık</span><b className={m == null ? "" : m >= 0 ? "pos" : "neg"}>{m == null ? "veri yok" : fmtPct(m)}</b></div>
      </div>
      <div className="ak-pf-cal-head">
        <button className="ak-icon" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
        <span><Calendar size={13} /> {monthLabel}</span>
        <button className="ak-icon" onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="ak-pf-cal-grid">
        {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((d2) => <span className="ak-pf-cal-dow" key={d2}>{d2}</span>)}
        {Array.from({ length: padCount }).map((_, i) => <span key={"pad" + i} />)}
        {calCells.map((c) => (
          <span
            key={c.date}
            className={"ak-pf-cal-cell" + (c.returnPct == null ? "" : c.returnPct >= 0 ? " pos" : " neg")}
            title={c.returnPct == null ? `${c.date}: veri yok` : `${c.date}: ${fmtPct(c.returnPct)}`}
          >
            {c.day}
          </span>
        ))}
      </div>
      <p className="ak-pf-history-note">Geçmiş veri bu cihazda ~1 yıl saklanır, daha eskisi otomatik budanır. Değerler günde bir kez (ilk açılışta) kaydedilir — kesintisiz gün sonu değil, o anki son bilinen durumdur.</p>
    </div>
  );
}

// U1-U6: Ekle modalı
function AddTransactionModal({ onClose, onSubmit, watchlist }) {
  const [side, setSide] = useState("buy"); // U4: Buy/Sell
  const [sym, setSym] = useState("");
  const [mode, setMode] = useState("qty"); // U1: 'qty' | 'amount' — swap-toggle
  const [qtyStr, setQtyStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [priceOverride, setPriceOverride] = useState(""); // U2
  const [showFee, setShowFee] = useState(false);
  const [feeStr, setFeeStr] = useState(""); // U3
  const [currencyIn, setCurrencyIn] = useState("USD");
  const [fxRateStr, setFxRateStr] = useState(String(APPROX_USD_TRY));
  const [when, setWhen] = useState(() => { // U5: varsayılan "şimdi"
    const d = new Date(); d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  const assetType = sym ? inferAssetType(sym) : null;
  const isBist = assetType === "bist";

  // U2: sembol seçilince (kripto ise) canlı fiyatı öntanımlı olarak çek
  const [livePrice, setLivePrice] = useState(null);
  useEffect(() => {
    setLivePrice(null);
    if (!sym || !assetType) return;
    let on = true;
    if (assetType === "crypto") {
      // AK-101 Bug3: hasData() curated semboller için SENTETİK yedeği de "veri var" sayar —
      // burada yalnız GERÇEK Binance verisi "canlı fiyat" olabilir, yoksa gerçek istek dönmeden
      // önce kullanıcıya fabrike bir fiyat gösterilip o fiyattan pozisyon kaydedilebilir
      // (D6/AK-031 ihlali — BTC'de yaşanan anormal K/Z yüzdesi bug'ının kök nedeni).
      loadReal(sym).catch(() => null).then(() => { if (on && isReal(sym)) setLivePrice(getBars(sym)[getBars(sym).length - 1].c); });
      if (isReal(sym)) setLivePrice(getBars(sym)[getBars(sym).length - 1].c);
    } else if (assetType === "us") {
      getUSStockPrice(sym).then((p) => { if (on && p != null) setLivePrice(p); });
    }
    return () => { on = false; };
  }, [sym, assetType]);

  const effectivePrice = priceOverride.trim() ? Number(priceOverride) : livePrice;
  const qtyNum = Number(qtyStr), amountNum = Number(amountStr);
  const computedQty = mode === "qty" ? qtyNum : (effectivePrice > 0 ? amountNum / effectivePrice : null);
  const computedAmount = mode === "amount" ? amountNum : (effectivePrice > 0 && qtyNum > 0 ? qtyNum * effectivePrice : null);
  const finalQty = mode === "qty" ? qtyNum : computedQty;
  // AK-101 Bug1/2: buton her zaman tıklanabilir olup küçük bir hata metniyle "sessizce" reddetmek
  // yerine — geçerli değilse baştan pasif. UI ve test AYNI saf fonksiyonu çağırır (canSubmitTransaction).
  const canSave = canSubmitTransaction({ assetType, isBist, price: effectivePrice, qty: finalQty });

  const suggestions = useMemo(() => {
    const pool = getSearchSymbols();
    const known = new Set(watchlist);
    const inWatch = pool.filter((s) => known.has(s.sym));
    const q = sym.trim().toUpperCase();
    const rest = q ? pool.filter((s) => s.sym.includes(q) && !known.has(s.sym)).slice(0, 8) : [];
    return { inWatch, rest };
  }, [sym, watchlist]);

  function submit() {
    setErr(null);
    if (!sym.trim()) { setErr("Sembol seç."); return; }
    if (!assetType) { setErr("Bu sembol için varlık tipi belirlenemedi — bilinen bir kripto/ABD hissesi dene."); return; }
    if (isBist) { setErr("BIST portföyde henüz kapalı (yakında)."); return; }
    const price = effectivePrice;
    if (!Number.isFinite(price) || price <= 0) { setErr("Fiyat gerekli — canlı fiyat gelmediyse manuel gir."); return; }
    const qty = mode === "qty" ? qtyNum : computedQty;
    if (!Number.isFinite(qty) || qty <= 0) { setErr("Geçerli bir adet/tutar gir."); return; }
    const fee = showFee ? Number(feeStr) || 0 : 0;
    const fxRate = currencyIn === "TRY" ? Number(fxRateStr) || APPROX_USD_TRY : 1;
    const ts = when ? new Date(when).getTime() : Date.now();
    const ev = onSubmit({ symbol: sym, assetType, type: side === "buy" ? "add" : "remove", qty, priceNative: price, currency: currencyIn, fxRate, feeNative: fee, ts });
    if (!ev) setErr("İşlem eklenemedi — girdileri kontrol et.");
  }

  return (
    <div className="ak-pf-modal-ov" onClick={onClose}>
      <div className="ak-pf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ak-pf-modal-head">
          <h3>İşlem ekle</h3>
          <button className="ak-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ak-pf-side">
          <button className={side === "buy" ? "on buy" : "buy"} onClick={() => setSide("buy")}>Buy</button>
          <button className={side === "sell" ? "on sell" : "sell"} onClick={() => setSide("sell")}>Sell</button>
        </div>

        <label className="ak-pf-field">
          <span>Sembol</span>
          <input ref={inputRef} value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="BTC, AAPL, SOL…" autoFocus />
          {sym.trim() && (
            <div className="ak-pf-sym-sug">
              {suggestions.inWatch.filter((s) => s.sym.includes(sym.trim().toUpperCase())).slice(0, 6).map((s) => (
                <button key={s.sym} onClick={() => setSym(s.sym)}><b>{s.sym}</b><em>izleme listesi</em></button>
              ))}
              {suggestions.rest.map((s) => (
                <button key={s.sym} onClick={() => setSym(s.sym)}><b>{s.sym}</b><em>{s.group || s.name}</em></button>
              ))}
            </div>
          )}
          {isBist && <span className="ak-pf-warn">BIST portföyde henüz kapalı — yarım/manuel destek de sunulmuyor (yanıltıcı veri riski).</span>}
        </label>

        <div className="ak-pf-swap">
          <label className="ak-pf-field">
            <span>{mode === "qty" ? "Adet" : "Tutar"}</span>
            <input
              type="number" min="0" step="any"
              value={mode === "qty" ? qtyStr : amountStr}
              onChange={(e) => (mode === "qty" ? setQtyStr(e.target.value) : setAmountStr(e.target.value))}
              placeholder={mode === "qty" ? "0.5" : "1000"}
            />
          </label>
          <button className="ak-pf-swapbtn" title="Adet ↔ Tutar" onClick={() => setMode((m) => (m === "qty" ? "amount" : "qty"))}><ArrowLeftRight size={15} /></button>
          <div className="ak-pf-computed">
            {mode === "qty"
              ? <span>≈ {Number.isFinite(computedAmount) ? computedAmount.toFixed(2) : "—"} {currencyIn}</span>
              : <span>≈ {Number.isFinite(computedQty) ? computedQty.toFixed(6) : "—"} adet</span>}
          </div>
        </div>

        <div className="ak-pf-chips">
          <label className="ak-pf-field sm">
            <span>Fiyat/Birim {livePrice != null && !priceOverride && "(canlı)"}</span>
            <input type="number" min="0" step="any" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} placeholder={livePrice != null ? livePrice.toFixed(4) : "manuel gir"} />
            {/* AK-101 Bug1: submit'i beklemeden görünen kalıcı ipucu — hata metni yalnız tıklayınca
                çıkınca fark edilmiyordu ("tepki vermiyor" hissi). */}
            {sym.trim() && assetType && !isBist && livePrice == null && !priceOverride.trim() && (
              <span className="ak-pf-hint">Canlı fiyat gelmedi — manuel gir.</span>
            )}
          </label>
          <label className="ak-pf-field sm">
            <span>Para birimi</span>
            <select value={currencyIn} onChange={(e) => setCurrencyIn(e.target.value)}>
              <option value="USD">USD</option>
              <option value="TRY">TRY</option>
            </select>
          </label>
          {currencyIn === "TRY" && (
            <label className="ak-pf-field sm">
              <span>Kur (1 USD=?₺)</span>
              <input type="number" min="0" step="any" value={fxRateStr} onChange={(e) => setFxRateStr(e.target.value)} />
            </label>
          )}
          <label className="ak-pf-field sm">
            <span>Tarih/saat</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </div>

        {!showFee ? (
          <button className="ak-pf-feetoggle" onClick={() => setShowFee(true)}>+ İşlem ücreti ekle</button>
        ) : (
          <label className="ak-pf-field sm">
            <span>Fee ({currencyIn}, maliyete eklenir)</span>
            <input type="number" min="0" step="any" value={feeStr} onChange={(e) => setFeeStr(e.target.value)} placeholder="0" />
          </label>
        )}

        {err && <p className="ak-pf-err">{err}</p>}

        <button className="ak-btn ak-btn-primary" onClick={submit} disabled={!canSave}>
          {side === "buy" ? "Al" : "Sat"} — kaydet
        </button>
      </div>
    </div>
  );
}

function eventTypeLabel(t) {
  if (t === "add") return "Alış";
  if (t === "remove") return "Satış";
  return "Maliyet güncelleme";
}

// AK-079: TradingView mobil "detay ekranı" referansı — ikon+sembol+durum rozeti, büyük fiyat,
// bugünkü+haftalık değişim satırları, zaman aralığı seçici, sekmeler (Genel Bakış/Geçmiş/Maliyet & K-Z).
// Alarm, karşılaştırma, "önemli veri noktaları" ve "Teknikler" sinyali BİLİNÇLİ OLARAK dışarıda
// bırakıldı (kapsam taşması + istatistiksel dürüstlük ilkesiyle çelişme riski — AK-079 kararı).
function AssetDetailModal({ row, events, currency, hideValues, onClose }) {
  const [tab, setTab] = useState("genel"); // genel | gecmis | maliyet
  const [period, setPeriod] = useState("1G");
  const Icon = ASSET_ICON[row.asset_type] || Bitcoin;
  const assetLabel = row.asset_type === "crypto" ? "Kripto" : row.asset_type === "us" ? "ABD" : "BIST";

  const periodDef = DETAIL_PERIODS.find((p) => p.key === period) || DETAIL_PERIODS[0];
  const periodChg = row.asset_type === "crypto" && hasData(row.symbol)
    ? periodChangePct(getBars(row.symbol), periodDef.bars)
    : null;

  return (
    <div className="ak-pf-modal-ov" onClick={onClose}>
      <div className="ak-pf-modal ak-pf-detail" onClick={(e) => e.stopPropagation()}>
        <div className="ak-pf-modal-head">
          <h3><Icon size={16} /> {row.symbol} <i className="ak-pf-detail-type">{assetLabel}</i></h3>
          <button className="ak-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ak-pf-detail-price">
          <b>{fmtDisplay(row.price, currency, hideValues)}</b>
          <div className="ak-pf-detail-chglines">
            <span className={row.dayChangePct == null ? "" : row.dayChangePct >= 0 ? "pos" : "neg"}>Bugün {row.dayChangePct == null ? "— veri yok" : fmtPct(row.dayChangePct)}</span>
            <span className={row.weekChangePct == null ? "" : row.weekChangePct >= 0 ? "pos" : "neg"}>Bu hafta {row.weekChangePct == null ? "— veri yok" : fmtPct(row.weekChangePct)}</span>
          </div>
          {row.asset_type !== "crypto" && (
            <i className="ak-pf-age" title="Fiyatın kaynak zamanı — sayfayı ne zaman açtığın değil">
              son güncelleme: {agoLabel(getUSStockPriceTimestamp(row.symbol)) || "—"}
            </i>
          )}
        </div>

        <div className="ak-pf-detail-periods">
          {DETAIL_PERIODS.map((p) => (
            <button key={p.key} className={period === p.key ? "on" : ""} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        <p className={"ak-pf-detail-periodchg " + (periodChg == null ? "" : periodChg >= 0 ? "pos" : "neg")}>
          {periodDef.label} değişim: {periodChg == null ? "veri yok (yalnız kripto için hesaplanır)" : fmtPct(periodChg)}
        </p>

        <div className="ak-pf-detail-tabs">
          <button className={tab === "genel" ? "on" : ""} onClick={() => setTab("genel")}><LayoutGrid size={13} /> Genel Bakış</button>
          <button className={tab === "gecmis" ? "on" : ""} onClick={() => setTab("gecmis")}><History size={13} /> Geçmiş</button>
          <button className={tab === "maliyet" ? "on" : ""} onClick={() => setTab("maliyet")}><Calculator size={13} /> Maliyet & K/Z</button>
        </div>

        {tab === "genel" && (
          <div className="ak-pf-detail-grid">
            <div><span className="k">Adet</span><b className="mono">{row.qty}</b></div>
            <div><span className="k">Değer</span><b className="mono">{fmtDisplay(row.value, currency, hideValues)}</b></div>
            <div><span className="k">Varlık tipi</span><b>{assetLabel}</b></div>
          </div>
        )}

        {tab === "gecmis" && (
          events.length === 0 ? <p className="ak-hint">Kayıt yok.</p> : (
            <div className="ak-pf-hist-list">
              {events.map((e) => (
                <div className={"ak-pf-hist-row " + e.type} key={e.id}>
                  <span className="tp">{eventTypeLabel(e.type)}</span>
                  <span className="mono">{e.qty ? `${e.qty} adet` : "—"}</span>
                  <span className="mono">{fmtDisplay(e.cost_usd, currency, hideValues)}{e.currency_entered !== "USD" && ` (${e.fx_rate_at_entry}× girişte)`}</span>
                  <span className="dt">{new Date(e.ts).toLocaleString("tr-TR")}</span>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "maliyet" && (
          <div className="ak-pf-detail-grid">
            <div><span className="k">Ort. maliyet</span><b className="mono">{fmtDisplay(row.avg_cost_usd, currency, hideValues)}</b></div>
            <div><span className="k">Toplam maliyet</span><b className="mono">{fmtDisplay(row.costValue, currency, hideValues)}</b></div>
            <div><span className="k">Güncel değer</span><b className="mono">{fmtDisplay(row.value, currency, hideValues)}</b></div>
            <div><span className="k">K/Z</span><b className={"mono " + (row.pnl >= 0 ? "pos" : "neg")}>{fmtDisplay(row.pnl, currency, hideValues)} ({fmtPct(row.pnlPct)})</b></div>
          </div>
        )}
      </div>
    </div>
  );
}
