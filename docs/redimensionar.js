// Cambiar el ancho de la lista de materias y del chat arrastrando sus bordes.
// Se recuerda en el navegador de cada persona. Doble clic en un borde: vuelve al tamaño original.
(() => {
  const layout = document.querySelector(".layout");
  const slot = document.getElementById("chat-slot");
  if (!layout) return;
  const KEY = "apuntes:tamanos";
  const DEF = { side: 290, chat: 360 };
  let t = {};
  try { t = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch {}
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} };

  // Límites: la lista entre 200 y 520 px; el chat entre 300 px y lo que deje al menos 380 px para los archivos
  const maxChat = () => Math.max(300, layout.clientWidth - (t.side || DEF.side) - 380 - 56);
  const lim = {
    side: (v) => Math.min(520, Math.max(200, v)),
    chat: (v) => Math.min(maxChat(), Math.max(300, v)),
  };
  function aplicar() {
    layout.style.setProperty("--side-w", lim.side(t.side || DEF.side) + "px");
    layout.style.setProperty("--chat-w", lim.chat(t.chat || DEF.chat) + "px");
    if (slot) {
      if (t.fw) slot.style.setProperty("--chat-fw", Math.min(t.fw, innerWidth - 32) + "px"); else slot.style.removeProperty("--chat-fw");
      if (t.fh) slot.style.setProperty("--chat-fh", Math.min(t.fh, innerHeight - 32) + "px"); else slot.style.removeProperty("--chat-fh");
    }
  }

  function arrastrar(el, alMover, alTerminar) {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("arrastrando"); document.body.classList.add("redimensionando");
      const mover = (ev) => { alMover(ev); aplicar(); };
      const fin = () => {
        el.classList.remove("arrastrando"); document.body.classList.remove("redimensionando");
        el.removeEventListener("pointermove", mover); el.removeEventListener("pointerup", fin); el.removeEventListener("pointercancel", fin);
        alTerminar && alTerminar(); guardar();
      };
      el.addEventListener("pointermove", mover); el.addEventListener("pointerup", fin); el.addEventListener("pointercancel", fin);
    });
  }

  // Borde de la lista de materias
  const rSide = document.querySelector(".resizer-side"), sidebar = document.getElementById("sidebar");
  arrastrar(rSide, (e) => { t.side = lim.side(e.clientX - sidebar.getBoundingClientRect().left); });
  // Borde del chat (pantallas grandes, chat fijo a la derecha)
  const rChat = document.querySelector(".resizer-chat");
  arrastrar(rChat, (e) => { t.chat = lim.chat(slot.getBoundingClientRect().right - e.clientX); quitarGrande(); });
  // Esquina del chat flotante (pantallas medianas): ancho y alto
  const esquina = document.querySelector(".ia-corner");
  arrastrar(esquina, (e) => {
    const r = slot.getBoundingClientRect();
    t.fw = Math.max(320, Math.min(innerWidth - 32, r.right - e.clientX));
    t.fh = Math.max(380, Math.min(innerHeight - 32, r.bottom - e.clientY));
    slot.classList.remove("grande"); quitarGrande();
  });

  // Doble clic: tamaño original
  rSide && rSide.addEventListener("dblclick", () => { delete t.side; aplicar(); guardar(); });
  rChat && rChat.addEventListener("dblclick", () => { delete t.chat; aplicar(); guardar(); });
  esquina && esquina.addEventListener("dblclick", () => { delete t.fw; delete t.fh; aplicar(); guardar(); });

  // Con el teclado: flechas izquierda/derecha sobre el borde
  const teclas = (el, k, signo) => el && el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const paso = (e.key === "ArrowRight" ? 1 : -1) * signo * (e.shiftKey ? 60 : 20);
    t[k] = lim[k]((t[k] || DEF[k]) + paso); aplicar(); guardar();
  });
  teclas(rSide, "side", 1);
  teclas(rChat, "chat", -1);

  // Botón ⤢: agranda el chat (y lo devuelve a como estaba)
  const btn = document.getElementById("ia-grande");
  let antes = null;
  function quitarGrande() { if (antes !== null) { antes = null; marcar(false); } }
  function marcar(on) { if (!btn) return; btn.textContent = on ? "⤡" : "⤢"; btn.title = on ? "Achicar" : "Agrandar"; btn.setAttribute("aria-pressed", String(on)); }
  btn && btn.addEventListener("click", () => {
    const flotante = matchMedia("(max-width: 1280px)").matches;
    if (flotante) { const on = slot.classList.toggle("grande"); marcar(on); return; }
    if (antes === null) { antes = t.chat || DEF.chat; t.chat = maxChat(); marcar(true); }
    else { t.chat = antes; antes = null; marcar(false); }
    aplicar(); guardar();
  });

  addEventListener("resize", aplicar);
  aplicar();
})();
