import PageShell from "../components/PageShell.jsx";
export default function Contributor() {
  return <PageShell
    eyebrow="CONTRIBUTOR"
    title="Üret, öğret, kazan."
    lead="Newbie → Contributor → Verified → Pro → Elite. İçeriğini paylaş, premium ders sat, gelir paylaşımına gir. (İskele hazır, açılış sonra.)"
    items={[
      { t: "Rütbe yolu", d: "İzlenme, fork ve etkileşimle yüksel.", soon: true },
      { t: "Premium video satışı", d: "Fiyat koy, platform komisyon alır (iyzico).", soon: true },
      { t: "Private trader profili", d: "Doğrulanmış/anonim özet metrikler.", soon: true },
    ]} />;
}
