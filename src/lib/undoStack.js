// AK-069: genel undo/redo yığını — komut deseni (her yıkıcı eylem kendi ters-eylemini push eder).
// Ne "indicators" ne "draws" state'ine doğrudan erişmez; tamamen jenerik — Chart.jsx (çizim silme)
// ve Lab.jsx (gösterge kaldırma) aynı örneği paylaşarak Ctrl+Z/Ctrl+Y ile tek bir zaman çizelgesinde
// geri/ileri alınabilir. max 30 adım (daha eskisi sessizce düşer).
export function createUndoStack(maxSteps = 30) {
  let undoList = [];
  let redoList = [];
  return {
    // action: { undo: () => void, redo: () => void, label?: string }
    push(action) {
      undoList.push(action);
      if (undoList.length > maxSteps) undoList.shift();
      redoList = [];
    },
    undo() {
      const a = undoList.pop();
      if (!a) return false;
      a.undo();
      redoList.push(a);
      return true;
    },
    redo() {
      const a = redoList.pop();
      if (!a) return false;
      a.redo();
      undoList.push(a);
      if (undoList.length > maxSteps) undoList.shift();
      return true;
    },
    canUndo() { return undoList.length > 0; },
    canRedo() { return redoList.length > 0; },
    clear() { undoList = []; redoList = []; },
  };
}

// Odak bir yazı alanında (input/textarea/select/contentEditable) ya da kod editöründe (CodeMirror)
// değilse true döner — Ctrl+Z o durumlarda kendi yerel geri-al'ına bırakılmalı, chart'ınkine karışmamalı.
function isSafeForGlobalUndo(el) {
  if (!el) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return false;
  if (el.closest && el.closest(".cm-editor")) return false;
  return true;
}

// Global Ctrl+Z (geri al) / Ctrl+Y ya da Ctrl+Shift+Z (ileri al) tuş dinleyicisi kurar.
// stackRef: { current: undoStack } — her zaman en güncel örneği okur (Lab.jsx useRef ile verir).
export function bindUndoHotkeys(stackRef) {
  function onKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    if (!isSafeForGlobalUndo(document.activeElement)) return;
    const stack = stackRef.current;
    if (!stack) return;
    if (key === "y" || (key === "z" && e.shiftKey)) {
      if (stack.redo()) e.preventDefault();
    } else if (key === "z") {
      if (stack.undo()) e.preventDefault();
    }
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
