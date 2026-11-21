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
    <div class="resizer resizer-chat" role="separator" aria-orientation="vertical" aria-label="Cambiar el ancho del chat" tabindex="0" title="Arrastrá para cambiar el ancho (doble clic: tamaño original)"></div>
    <div class="ia-corner" title="Arrastrá para cambiar el tamaño (doble clic: tamaño original)" aria-hidden="true"></div>
    <div class="ia" role="region" aria-label="Asistente con IA">
      <div class="ia-head">
        <strong>✨ Preguntale a la IA</strong>
        <div class="ia-head-act">
          <button class="ia-icon" id="ia-nuevo" title="Nueva conversación" aria-label="Nueva conversación">↺</button>
          <button class="ia-icon" id="ia-grande" title="Agrandar" aria-label="Agrandar el chat" aria-pressed="false">⤢</button>
          <button class="ia-icon ia-cerrar" id="ia-cerrar" title="Cerrar" aria-label="Cerrar">✕</button>
        </div>
      </div>
      <div class="ia-ctx" id="ia-ctx" hidden></div>
      <div class="ia-msgs" id="ia-msgs" aria-live="polite"></div>
      <form class="ia-form" id="ia-form">
        <textarea id="ia-in" rows="1" maxlength="2000" placeholder="Preguntá lo que necesites…" aria-label="Tu pregunta"></textarea>
        <button class="btn" id="ia-send" type="submit" aria-label="Enviar">➤</button>
      </form>
      <p class="ia-nota" id="ia-nota">Buscar material es ilimitado. Las explicaciones con IA tienen un límite por día y pueden equivocarse.</p>
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
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => {
        const interno = u.startsWith(location.origin + location.pathname.replace(/[^/]*$/, ""));
        return interno ? `<a href="${u}" data-interno>${t}</a>` : `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
      });
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


  // ---------- Buscador local: corre en el navegador, gratis y sin límite ----------
  const norm = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ROMANOS = { "1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v" };
  const VACIAS = new Set("de la las los el y en a del para con por que un una al".split(" "));
  const tokens = (t) => norm(t).replace(/\b([1-5])\b/g, (m) => ROMANOS[m]).split(/[^a-z0-9]+/).filter(Boolean);
  const ALIAS = { "bd": "Base de Datos y Administración de Datos I", "bases de datos": "Base de Datos y Administración de Datos I", "base de datos": "Base de Datos y Administración de Datos I",
    "so": "Sistemas Operativos", "eda": "Estructura de Datos y Algoritmos", "ia": "Inteligencia Artificial",
    "pln": "Procesamiento del Lenguaje Natural", "nlp": "Procesamiento del Lenguaje Natural", "qa": "Testing y QA",
    "probabilidad": "Probabilidad y Estadística I", "estadistica": "Probabilidad y Estadística I", "discreta": "Matemática Discreta",
    "programacion i": "Introducción a la Programación", "intro a la programacion": "Introducción a la Programación" };
  let catalogo = null;
  async function cargarCatalogo() {
    if (catalogo) return catalogo;
    const [d, dr] = await Promise.all([
      fetch("data.json").then((r) => r.json()),
      fetch("drive.json").then((r) => r.json()).catch(() => ({})),
    ]);
    const docs = d.documentos || [];
    catalogo = { docs, drive: dr, materias: [...new Set(docs.map((x) => x.materia))],
      profes: [...new Set(docs.map((x) => x.profesor).filter((p) => p !== "Sin profesor"))] };
    return catalogo;
  }
  const ROM = /^(i|ii|iii|iv|v|iiia|iib)$/;
  function detectarMateria(q, materias) {
    const nq = " " + tokens(q).join(" ") + " ";
    for (const [a, m] of Object.entries(ALIAS)) if (nq.includes(" " + tokens(a).join(" ") + " ") && materias.includes(m)) return m;
    let mejor = null, puntaje = 0;
    for (const m of materias) {
      const tm = tokens(m).filter((w) => !VACIAS.has(w));
      const hits = tm.filter((w) => nq.includes(" " + w + " ")).length;
      if (!hits) continue;
      // Exige coincidir los números romanos (Física I ≠ Física IIB) y premia coincidencias completas
      // Números romanos: si la pregunta nombra uno, tiene que coincidir (Física I ≠ Física IIB)
      const rom = tm.filter((w) => ROM.test(w)), romQ = nq.trim().split(" ").filter((w) => ROM.test(w));
      if (romQ.length && rom.length && !rom.some((w) => romQ.includes(w) || romQ.includes(w.replace(/[ab]$/, "")))) continue;
      const base = tm.filter((w) => !ROM.test(w));
      const hb = base.filter((w) => nq.includes(" " + w + " ")).length;
      if (base.length && hb / base.length < 0.5) continue;
      const p = hits / tm.length + hits * 0.01;
      if (p > puntaje) { puntaje = p; mejor = m; }
    }
    return puntaje >= 0.3 ? mejor : null;
  }
  function detectarProfe(q, profes) {
    const tq = new Set(tokens(q));
    return profes.find((p) => tokens(p).some((w) => w.length > 3 && tq.has(w))) || null;
  }
  const urlAbs = (a) => new URL(a, location.href).href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  const urlCarpeta = (m, p) => new URL("#" + encodeURIComponent(m) + (p ? "/" + encodeURIComponent(p) : ""), location.href).href;
  const profeTxt = (p) => (p === "Sin profesor" ? "Otros" : p);

  async function buscarLocal(q) {
    const { docs, drive, materias, profes } = await cargarCatalogo();
    const nq = norm(q);
    const materia = detectarMateria(q, materias);
    const profe = detectarProfe(q, profes);
    let tipo = null;
    if (/recu/.test(nq)) tipo = "Recuperatorio";
    else if (/\bfinal/.test(nq)) tipo = "Final";
    else if (/parcial|examen/.test(nq)) tipo = "Parcial";
    else if (/resumen|apunte|teoria|guia/.test(nq)) tipo = "Apunte";
    let numero = null;
    if (/(1er|1ro|primer|parcial 1\b|1 parcial)/.test(nq)) numero = 1;
    else if (/(2do|segundo|parcial 2\b|2 parcial)/.test(nq)) numero = 2;
    const anio = (nq.match(/\b(19|20)\d{2}\b/) || [])[0];
    const resuelto = /resuel|resolu|respuesta|solucion/.test(nq);

    let r = docs.filter((d) => (!materia || d.materia === materia) && (!profe || d.profesor === profe));
    if (!materia && !profe) {
      // Sin materia reconocida: busca las palabras en los títulos
      const ws = tokens(q).filter((w) => w.length > 3 && !VACIAS.has(w) && !/^(pasame|tenes|tenés|parcial|parciales|finales|final|material|quiero|necesito|busco|resumen|apuntes?)$/.test(w));
      if (!ws.length) return { materia, profe, lista: [], drive };
      r = r.filter((d) => ws.every((w) => tokens(`${d.titulo} ${d.materia} ${d.profesor}`).includes(w)));
    }
    const filtrar = (lista, f) => lista
      .filter((d) => !f.tipo || d.tipo === f.tipo)
      .filter((d) => !f.numero || d.numero === f.numero || d.numero == null || d.tipo !== "Parcial")
      .filter((d) => !f.anio || String(d.anio) === f.anio)
      .filter((d) => !f.resuelto || /resuel|resolu|respuesta|soluci/.test(norm(d.titulo)));
    // Si no hay nada exacto, se aflojan los filtros de a uno: año, número, "resuelto" y por último el tipo
    let f = { tipo, numero, anio, resuelto }, lista = filtrar(r, f), relajado = false;
    for (const k of ["anio", "numero", "resuelto", "tipo"]) {
      if (lista.length || !r.length) break;
      if (f[k]) { f = { ...f, [k]: null }; lista = filtrar(r, f); relajado = true; }
    }
    const exacto = (d) => (numero && d.numero === numero ? 1 : 0);
    lista.sort((a, b) => exacto(b) - exacto(a) || (b.anio || 0) - (a.anio || 0) || a.titulo.localeCompare(b.titulo));
    return { materia, profe, tipo, lista, relajado, drive };
  }

  // Carpetas dentro de la página: primero la de la materia y después las de sus profes
  function carpetasPagina(materia, soloProfes) {
    const docs = (catalogo?.docs || []).filter((d) => d.materia === materia);
    const profs = [...new Set(docs.map((d) => d.profesor))].filter((p) => !soloProfes || soloProfes.includes(p))
      .sort((a, b) => (a === "Otros") - (b === "Otros") || a.localeCompare(b, "es"));
    const links = profs.slice(0, 6).map((p) => `[${profeTxt(p)}](${urlCarpeta(materia, p)})`);
    return `📂 **Carpetas en la página:** [${materia}](${urlCarpeta(materia)})${links.length ? " → " + links.join(" · ") : ""}`;
  }
  function respuestaLocal(q, res) {
    const { materia, profe, lista, relajado, drive } = res;
    if (!lista.length) {
      const carp = materia && drive[materia];
      if (materia) {
        let t = `No encontré eso exacto en **${materia}**. Fijate en sus carpetas, acá en la página:\n\n${carpetasPagina(materia)}`;
        if (carp && carp.length) t += `\n\nSi ahí tampoco está, buscalo en el Drive original: ${carp.map((u, i) => `[Drive de ${materia}${carp.length > 1 ? " " + (i + 1) : ""}](${u})`).join(" · ")}`;
        return t;
      }
      let t = "No encontré material con eso. Probá nombrando la materia, por ejemplo: “pasame finales de Álgebra”, o elegila en la lista de **Todas las materias**.";
      if (drive._raiz) t += `\n\nSi la materia no está en la página, buscala en el [Drive original](${drive._raiz}).`;
      return t;
    }
    const MAX = 15;
    const grupos = {};
    for (const d of lista.slice(0, MAX)) (grupos[d.tipo] ||= []).push(d);
    const plural = { Parcial: "Parciales", Final: "Finales", Recuperatorio: "Recuperatorios", Apunte: "Resúmenes y apuntes", Otro: "Otros" };
    let t = relajado ? "No encontré exactamente eso, pero hay esto" : `Encontré ${lista.length} archivo${lista.length > 1 ? "s" : ""}`;
    t += materia ? ` de **${materia}**` : "";
    t += profe ? ` con **${profe}**` : "";
    t += ":\n";
    for (const [tipo, ds] of Object.entries(grupos)) {
      t += `\n### ${plural[tipo] || tipo}\n`;
      for (const d of ds) t += `- [${d.titulo} (${d.anio || "sin fecha"})${materia ? "" : " — " + d.materia}](${urlAbs(d.archivo)}) · ${profeTxt(d.profesor)}\n`;
    }
    if (lista.length > MAX) t += `\n…y ${lista.length - MAX} más.`;
    if (materia) t += `\n\n${carpetasPagina(materia, profe ? [profe] : null)}`;
    else {
      const mats = [...new Set(lista.map((d) => d.materia))].slice(0, 4);
      t += `\n\n📂 **Carpetas en la página:** ${mats.map((m) => `[${m}${profe ? " — " + profeTxt(profe) : ""}](${urlCarpeta(m, profe)})`).join(" · ")}`;
    }
    return t;
  }


  // ¿La pregunta necesita IA (explicar, practicar, resumir) o alcanza con buscar archivos?
  const PIDE_ARCHIVOS = /(pasame|pasa |tenes|tenés|hay |busc|dame|mandame|quiero|necesito|donde)/;
  const PIDE_IA = /\b(explic\w*|resolv\w*|resolve\w*|ejercicio\w*|practic\w*|simulacro\w*|resumi\w*|resumí\w*|entend\w*|por que|como se|como hago|como resuelvo|que es|que son|que temas|temas|ayudame|corregi\w*)\b/;
  function necesitaIA(q) {
    const n = norm(q);
    if (estado.archivo) return true;
    if (PIDE_IA.test(n) && !(PIDE_ARCHIVOS.test(n) && /(parciales|finales|resumenes|apuntes|material|recuperatorios)/.test(n))) return true;
    return false;
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
        <p class="ia-tip">Probá: <i>“pasame finales de Álgebra”</i>, <i>“2do parcial de Sistemas Operativos 2025”</i> o abrí un parcial y tocá <b>✨ Preguntale a la IA</b> para que lo lea con vos.</p></div>`;
      msgs.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { input.value = b.dataset.p; input.focus(); autoalto(); });
      return;
    }
    msgs.innerHTML = estado.mensajes.map((m) =>
      `<div class="ia-msg ${m.role === "user" ? "yo" : "bot"}${m.error ? " err" : ""}">${m.role === "user" ? `<p>${esc(m.content)}</p>` : md(m.content)}</div>`).join("");
    // Se muestra desde la última pregunta, así la respuesta se lee de arriba hacia abajo
    const preguntas = msgs.querySelectorAll(".ia-msg.yo");
    const ult = preguntas[preguntas.length - 1];
    msgs.scrollTop = ult ? ult.offsetTop - msgs.offsetTop - 8 : msgs.scrollHeight;
  }

  const autoalto = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", autoalto);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  let ocupado = false;
  let iaApagada = sessionStorage.getItem("ia-off") === "1"; // si el servidor no tiene IA configurada, no se vuelve a intentar
  async function preguntarIA() {
    const r = await fetch(URL_IA, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey },
      body: JSON.stringify({ mensajes: estado.mensajes.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content })), archivo: estado.archivo }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503) { iaApagada = true; try { sessionStorage.setItem("ia-off", "1"); } catch {} }
    if (!r.ok || j.error) { const e = new Error(j.error || "No se pudo responder."); e.status = r.status; throw e; }
    if (typeof j.quedan === "number") $("ia-nota").textContent = `Buscar material es ilimitado. Te quedan ${j.quedan} preguntas a la IA hoy.`;
    return j.respuesta;
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const texto = input.value.trim(); if (!texto || ocupado) return;
    ocupado = true; $("ia-send").disabled = true;
    estado.mensajes.push({ role: "user", content: texto }); input.value = ""; autoalto(); guardar(); pintar();
    const usarIA = necesitaIA(texto) && !iaApagada;
    const pensando = document.createElement("div");
    pensando.className = "ia-msg bot pensando";
    pensando.innerHTML = `<span class="ia-dots"><i></i><i></i><i></i></span> ${usarIA ? (estado.archivo ? "Leyendo el archivo…" : "Pensando…") : "Buscando…"}`;
    msgs.appendChild(pensando); msgs.scrollTop = msgs.scrollHeight;
    try {
      let respuesta = null;
      if (usarIA) {
        try { respuesta = await preguntarIA(); }
        catch (err) {
          // Sin IA (no configurada, límite o error): igual se busca el material
          const res = await buscarLocal(texto);
          respuesta = `${err.message}${res.lista.length ? "\n\nMientras tanto, esto es lo que hay:\n\n" + respuestaLocal(texto, res) : ""}`;
          if (!res.lista.length) throw new Error(err.message);
        }
      } else {
        const res = await buscarLocal(texto);
        if (!res.lista.length && !iaApagada && !res.materia) {
          try { respuesta = await preguntarIA(); } catch { respuesta = respuestaLocal(texto, res); }
        } else respuesta = respuestaLocal(texto, res);
      }
      estado.mensajes.push({ role: "assistant", content: respuesta });
    } catch (err) {
      estado.mensajes.push({ role: "assistant", content: err.message || "No se pudo responder.", error: true });
    } finally {
      ocupado = false; $("ia-send").disabled = false; guardar(); pintar();
    }
  };

  msgs.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-interno]"); if (!a) return;
    const u = new URL(a.href);
    const flotante = matchMedia("(max-width: 1280px)").matches;
    if (/\.pdf$/i.test(u.pathname) && window.BancoApp) {
      const ruta = decodeURIComponent(u.pathname).replace(/^.*?\/(archivos\/)/, "$1");
      if (window.BancoApp.abrirArchivo(ruta)) { e.preventDefault(); return; }
    }
    if (u.hash) { e.preventDefault(); location.hash = u.hash; if (flotante) cerrar(); }
  });
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
