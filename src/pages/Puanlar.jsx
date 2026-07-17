import { Zap, ShieldCheck } from "lucide-react";
import { EARNING_TABLE, SPENDING_TABLE, MONTHLY_CAP } from "../lib/points.js";
import "../styles/puanlar.css";

// AK-023-EXT: şeffaflık ilkesi — kazanım/harcama kuralları herkese açık ve sabit, gizli çarpan yok.
// Kaynak points.js'teki AYNI sabitler (EARNING_TABLE/SPENDING_TABLE) — burada ayrı bir kopya
// TUTULMAZ, tablo değişirse tek yerden (points.js) değişir, sayfa otomatik güncel kalır.
export default function Puanlar() {
  return (
    <div className="ak-page ak-puanlar">
      <span className="ak-eyebrow">ŞEFFAFLIK</span>
      <h1>Kulak Puanı</h1>
      <p className="lead">
        Kapalı devre topluluk enerjisi. Alınıp satılamaz, transfer edilemez, TL/USD karşılığı yoktur.
        Kazanım yalnız topluluğa yararlı davranıştan gelir — işlem hacminden ya da kâğıt-para
        performansından <b>asla</b>. Harcamak geçici enerjidir; rütbe (Katkı Rütbesi) kalıcı itibardır
        ve puan harcamakla düşmez.
      </p>

      <section className="ak-puanlar-sec">
        <h2><Zap size={16} /> Nasıl kazanılır</h2>
        <div className="ak-puanlar-table">
          <div className="ak-puanlar-h"><span>Davranış</span><span>Puan</span><span>Sınır</span></div>
          {EARNING_TABLE.map((row) => (
            <div className={"ak-puanlar-r" + (row.wired ? "" : " soon")} key={row.key}>
              <span>{row.label}{!row.wired && <em className="ak-soon">Yakında</em>}</span>
              <span className="mono">+{row.points}</span>
              <span className="cap">{row.cap}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ak-puanlar-sec">
        <h2><ShieldCheck size={16} /> Nasıl kullanılır</h2>
        <div className="ak-puanlar-table">
          <div className="ak-puanlar-h"><span>Kalem</span><span>Bedel</span><span>Süre</span></div>
          {SPENDING_TABLE.map((row) => (
            <div className="ak-puanlar-r" key={row.key}>
              <span>{row.label}</span>
              <span className="mono">{row.cost}</span>
              <span className="cap">{row.durationDays ? `${row.durationDays} gün` : row.maxPurchases ? `kalıcı · max ${row.maxPurchases}` : "kalıcı"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ak-puanlar-sec">
        <h2>Enflasyon frenleri</h2>
        <ul className="ak-puanlar-brakes">
          <li>Davet puanı yalnız davet edilen kişi <b>aktifleşince</b> düşer — kayıt olmak yetmez.</li>
          <li>Sicil serisi puanı işlem sayısından bağımsızdır: bir günde 1 kayıt da 50 kayıt da aynı — yalnız o gün sicile giriş yapılmış mı diye bakılır.</li>
          <li>Kazanım tablosu değişirse geçmişte kazanılmış puanlar korunur — değişiklik önce duyurulur.</li>
          <li>Kullanıcı başına aylık toplam kazanım tavanı: <b>{MONTHLY_CAP}</b> puan.</li>
        </ul>
      </section>
    </div>
  );
}
