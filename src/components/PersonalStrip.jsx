import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export default function PersonalStrip() {
  return (
    <section className="ak-personal">
      <div>
        <h3>Kaldığın yerden devam et.</h3>
        <p>İlerlemen, takip ettiğin contributor’lar ve kâğıt-para portföyün burada toplanır.</p>
      </div>
      <Link className="ak-btn ak-btn-primary" to="/giris">Davet kodunla gir <ChevronRight size={16} /></Link>
    </section>
  );
}
