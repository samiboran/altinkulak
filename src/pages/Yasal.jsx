import PageShell from "../components/PageShell.jsx";
export default function Yasal() {
  return <PageShell
    eyebrow="YASAL & RİZİKO"
    title="Eğitim ve simülasyon — danışmanlık değil."
    lead="Altınkulak bir eğitim ve simülasyon ortamıdır. Yatırım danışmanlığı veya sinyal servisi değildir; içerikteki hiçbir şey alım-satım tavsiyesi sayılamaz. Geçmiş performans geleceği garanti etmez. Verilerin gecikmeli olabileceğini unutma. KVKK kapsamında kişisel verilerin işlenmesine dair bilgilendirme yayımlanacaktır."
    items={[
      { t: "Riziko uyarısı", d: "Piyasalar sermaye kaybettirebilir; sorumluluk kullanıcıya aittir.", soon: false },
      { t: "KVKK", d: "Aydınlatma metni ve veri işleme esasları.", soon: true },
      { t: "Kullanım şartları", d: "Hizmet kapsamı ve sınırları.", soon: true },
    ]} />;
}
