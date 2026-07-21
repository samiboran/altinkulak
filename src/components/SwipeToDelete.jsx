import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { clampSwipeX, shouldSnapOpen, SWIPE_REVEAL_PX } from "../lib/swipeGesture.js";

// AK-103: telefon kilit ekranı tarzı sola-kaydır-sil. Kaydırmanın KENDİSİ hiçbir zaman silmez —
// yalnız açık durumda beliren "Sil" butonuna AYRICA dokununca silinir (yanlışlıkla silmeye karşı).
// Saf matematik src/lib/swipeGesture.js'te (test edilir), burası yalnız dokunma olaylarını bağlar.
export default function SwipeToDelete({ onDelete, deleteLabel = "Sil", children }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  function onTouchStart(e) {
    const t = e.touches[0];
    dragRef.current = { x0: t.clientX, startDx: dx };
    setDragging(true);
  }
  function onTouchMove(e) {
    if (!dragRef.current) return;
    const t = e.touches[0];
    setDx(clampSwipeX(dragRef.current.startDx + (t.clientX - dragRef.current.x0)));
  }
  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setDx((cur) => (shouldSnapOpen(cur) ? -SWIPE_REVEAL_PX : 0));
  }

  return (
    <div className="ak-swipe">
      <button
        className="ak-swipe-del" style={{ width: SWIPE_REVEAL_PX }}
        onClick={() => { setDx(0); onDelete(); }} aria-label={deleteLabel} title={deleteLabel}
      >
        <Trash2 size={16} />
      </button>
      <div
        className={"ak-swipe-content" + (dragging ? " dragging" : "")}
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={endDrag} onTouchCancel={endDrag}
      >
        {children}
      </div>
    </div>
  );
}
