// Chat con la IA del Banco de Parciales.
// Habla con la Edge Function "ia" de Supabase; la clave de Claude nunca llega al navegador.
(() => {
  const CFG = window.APUNTES_CONFIG || {};
  if (!CFG.supabaseUrl) return;
  const URL_IA = CFG.supabaseUrl.replace(/\/$/, "") + "/functions/v1/ia";
  const slot = document.getElementById("chat-slot");
  if (!slot) return;

  const KEY = "ia-chat";
  let estado = { mensajes: [], archivo: null, archivoTitulo: "" };
  try { estado = { ...estado, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") }; } catch {}
  const guardar = () => { try { sessionStorage.setItem(KEY, JSON.stringify(estado)); } catch {} };

  slot.innerHTML = `
    <div class="ia" role="region" aria-label="Asistente con IA">
      <div class="ia-head">
        <strong>✨ Preguntale a la IA</strong>
        <div class="ia-head-act">
          <button class="ia-icon" id="ia-nuevo" title="Nueva conversación" aria-label="Nueva conversación">↺</button>
          <button class="ia-icon ia-cerrar" id="ia-cerrar" title="Cerrar" aria-label="Cerrar">✕</button>
        </div>
      </div>
      <div class="ia-ctx" id="ia-ctx" hidden></div>
      <div class="ia-msgs" id="ia-msgs" aria-live="polite"></div>
      <form class="ia-form" id="ia-form">
        <textarea id="ia-in" rows="1" maxlength="2000" placeholder="Preguntá lo que necesites…" aria-label="Tu pregunta"></textarea>
        <button class="btn" id="ia-send" type="submit" aria-label="Enviar">➤</button>
      </form>
      <p class="ia-nota" id="ia-nota">Puede equivocarse: revisá lo importante. Hay un límite de consultas por día.</p>
    </div>`;
  const fab = document.createElement("button");
  fab.className = "ia-fab"; fab.id = "ia-fab"; fab.type = "button";
  fab.innerHTML = "✨ <span>Preguntale a la IA</span>";
  document.body.appendChild(fab);

  const $ = (id) => document.getElementById(id);
  const msgs = $("ia-msgs"), input = $("ia-in"), form = $("ia-form");

  const SUGERENCIAS = [
    ["🔎 Buscar material", "Pasame parciales y finales de "],
    ["🧠 Practicar", "Armame un simulacro de práctica para el parcial de "],
    ["📝 Resumen", "Resumime los temas que más se toman en "],
  ];

  // Markdown mínimo y seguro: primero se escapa todo, después se dan formato a negritas, títulos, listas y links http(s)
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  }
  function md(texto) {
    const lineas = esc(texto).split("\n"); let html = "", lista = null, code = false;
    const cerrar = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (const l of lineas) {
      if (/^```/.test(l)) { cerrar(); html += code ? "</pre>" : "<pre>"; code = !code; continue; }
      if (code) { html += l + "\n"; continue; }
      let m;
      if ((m = l.match(/^#{1,4}\s+(.*)/))) { cerrar(); html += `<h4>${inline(m[1])}</h4>`; }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== "ul") { cerrar(); html += "<ul>"; lista = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== "ol") { cerrar(); html += "<ol>"; lista = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if (!l.trim()) { cerrar(); }
      else if (/^---+$/.test(l.trim())) { cerrar(); html += "<hr>"; }
      else { cerrar(); html += `<p>${inline(l)}</p>`; }
    }
    cerrar(); if (code) html += "</pre>";
    return html;
  }

  function pintar() {
    const ctx = $("ia-ctx");
    if (estado.archivo) {
      ctx.hidden = false;
      ctx.innerHTML = `📄 Sobre: <b>${esc(estado.archivoTitulo)}</b> <button class="ia-x" title="Dejar de preguntar sobre este archivo" aria-label="Quitar archivo">✕</button>`;
      ctx.querySelector("button").onclick = () => { estado.archivo = null; guardar(); pintar(); };
    } else ctx.hidden = true;

    if (!estado.mensajes.length) {
      msgs.innerHTML = `<div class="ia-hola">
        <p>¡Hola! Te ayudo a <b>encontrar material</b> de cualquier materia, a <b>entender un parcial</b> paso a paso, a <b>practicar</b> con ejercicios al estilo de los reales y a <b>resumir</b> lo que se toma.</p>
        <div class="ia-sug">${SUGERENCIAS.map(([t, p]) => `<button type="button" class="chip" data-p="${esc(p)}">${t}</button>`).join("")}</div>
        <p class="ia-tip">Tip: abrí un parcial y tocá <b>✨ Preguntale a la IA</b> para que lo lea con vos.</p></div>`;
      msgs.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { input.value = b.dataset.p; input.focus(); autoalto(); });
      return;
    }
    msgs.innerHTML = estado.mensajes.map((m) =>
      `<div class="ia-msg ${m.role === "user" ? "yo" : "bot"}${m.error ? " err" : ""}">${m.role === "user" ? `<p>${esc(m.content)}</p>` : md(m.content)}</div>`).join("");
    msgs.scrollTop = msgs.scrollHeight;
  }

  const autoalto = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", autoalto);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  let ocupado = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const texto = input.value.trim(); if (!texto || ocupado) return;
    ocupado = true; $("ia-send").disabled = true;
    estado.mensajes.push({ role: "user", content: texto }); input.value = ""; autoalto(); guardar(); pintar();
    const pensando = document.createElement("div");
    pensando.className = "ia-msg bot pensando";
    pensando.innerHTML = `<span class="ia-dots"><i></i><i></i><i></i></span> ${estado.archivo ? "Leyendo el archivo…" : "Buscando…"}`;
    msgs.appendChild(pensando); msgs.scrollTop = msgs.scrollHeight;
    try {
      const r = await fetch(URL_IA, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey },
        body: JSON.stringify({ mensajes: estado.mensajes.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), archivo: estado.archivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "No se pudo responder. Probá de nuevo.");
      estado.mensajes.push({ role: "assistant", content: j.respuesta });
      if (typeof j.quedan === "number") $("ia-nota").textContent = `Puede equivocarse: revisá lo importante. Te quedan ${j.quedan} consultas hoy.`;
    } catch (err) {
      estado.mensajes.push({ role: "assistant", content: err.message || "No se pudo conectar con la IA.", error: true });
    } finally {
      ocupado = false; $("ia-send").disabled = false; guardar(); pintar();
    }
  };

  $("ia-nuevo").onclick = () => { estado = { mensajes: [], archivo: null, archivoTitulo: "" }; guardar(); pintar(); input.focus(); };
  const abrir = () => { slot.classList.add("open"); document.body.classList.add("ia-abierta"); setTimeout(() => input.focus(), 50); };
  const cerrar = () => { slot.classList.remove("open"); document.body.classList.remove("ia-abierta"); };
  fab.onclick = abrir; $("ia-cerrar").onclick = cerrar;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && slot.classList.contains("open")) cerrar(); });

  // Desde el visor de PDF: preguntar sobre ese archivo
  window.BancoIA = {
    sobre(d) {
      if (estado.archivo !== d.id) {
        estado.archivo = d.id;
        estado.archivoTitulo = `${d.titulo} — ${d.materia}`;
        guardar();
      }
      pintar(); abrir();
      if (!input.value) { input.value = "Explicame este parcial y resolvé el primer ejercicio paso a paso"; autoalto(); input.select(); }
    },
  };
  pintar();
})();
