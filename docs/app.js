(() => {
  const CFG = window.APUNTES_CONFIG || {};
  const REMOTE = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const $ = (s) => document.querySelector(s);

  const state = { docs: [], profes: [], stats: {}, votos: {}, misVotos: load("misVotos", {}), liked: load("liked", {}), materia: "", profesor: "", tipo: "", q: "", sort: "recientes", vista: "docs", profMateria: "", modo: load("modo", "lista") };

  function load(k, d) { try { return JSON.parse(localStorage.getItem("apuntes:" + k)) ?? d; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem("apuntes:" + k, JSON.stringify(v)); } catch {} }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

  // ---------- Likes y descargas ----------
  const api = (path, opts = {}) => fetch(`${CFG.supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: CFG.supabaseAnonKey,
      // Las claves nuevas (sb_publishable_…) van solo en "apikey"; las viejas (JWT) también como Bearer.
      ...(CFG.supabaseAnonKey.startsWith("sb_") ? {} : { Authorization: `Bearer ${CFG.supabaseAnonKey}` }),
      "Content-Type": "application/json", ...(opts.headers || {}),
    },
  });

  async function loadStats() {
    if (!REMOTE) { state.stats = load("localStats", {}); return; }
    try {
      const rows = await (await api("stats?select=doc_id,likes,descargas")).json();
      state.stats = Object.fromEntries(rows.map((r) => [r.doc_id, r]));
    } catch (e) { console.warn("No se pudieron cargar los likes", e); }
  }

  async function bump(id, campo, delta) {
    const s = (state.stats[id] ||= { likes: 0, descargas: 0 });
    s[campo] = Math.max(0, (s[campo] || 0) + delta);
    if (!REMOTE) { save("localStats", state.stats); return; }
    try {
      const r = await api("rpc/sumar", { method: "POST", body: JSON.stringify({ p_doc: id, p_campo: campo, p_delta: delta }) });
      const v = await r.json();
      if (typeof v === "number") s[campo] = v;
    } catch (e) { console.warn(e); }
  }

  // ---------- Votos de profes ----------
  function votanteId() {
    let id = load("votante", "");
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ Math.random() * 16 >> c / 4).toString(16)); save("votante", id); }
    return id;
  }
  async function loadVotos() {
    if (!REMOTE) { state.votos = {}; return; }
    try {
      const rows = await (await api("rpc/resumen_votos", { method: "POST", body: "{}" })).json();
      const v = {};
      for (const r of rows) (v[r.profesor] ||= {})[r.voto] = Number(r.cantidad);
      state.votos = v;
    } catch (e) { console.warn("No se pudieron cargar los votos", e); }
  }
  async function votarProfe(nombre, voto) {
    const antes = state.misVotos[nombre], nuevo = antes === voto ? null : voto;
    const v = (state.votos[nombre] ||= {});
    if (antes) v[antes] = Math.max(0, (v[antes] || 0) - 1);
    if (nuevo) v[nuevo] = (v[nuevo] || 0) + 1;
    if (nuevo) state.misVotos[nombre] = nuevo; else delete state.misVotos[nombre];
    save("misVotos", state.misVotos);
    renderProfes(); renderSidebar();
    if (!REMOTE) return;
    try { await api("rpc/votar_profe", { method: "POST", body: JSON.stringify({ p_profesor: nombre, p_votante: votanteId(), p_voto: nuevo }) }); }
    catch (e) { console.warn(e); }
  }

  // ---------- Navegación (hash: #materia/profesor) ----------
  function readHash() {
    const especiales = { "#profesores": "profes", "#subir": "subir", "#sugerencias": "sugerir" };
    if (especiales[location.hash]) { state.vista = especiales[location.hash]; state.materia = state.profesor = ""; return; }
    state.vista = "docs";
    const [m = "", p = ""] = location.hash.slice(1).split("/").map(decodeURIComponent);
    state.materia = m; state.profesor = p;
  }

  // ---------- Opiniones sobre profes ----------
  const OP = {
    "recomendado": { icon: "✅", titulo: "Recomendados", clase: "recomendado" },
    "neutro": { icon: "⚪", titulo: "Neutros", clase: "neutro" },
    "no recomendado": { icon: "❌", titulo: "No recomendados", clase: "no-recomendado" },
  };
  const profeInfo = (nombre) => state.profes.find((p) => norm(p.nombre) === norm(nombre));
  // Opinión para una materia: la de esa materia si existe, si no la general
  // La opinión inicial (profesores.yml) cuenta como 1 voto; después manda lo que vote la mayoría
  function conteo(p, materia) {
    const semilla = (materia && p.materias[materia]) || p.general || null;
    const c = { ...(state.votos[p.nombre] || {}) };
    if (semilla) c[semilla] = (c[semilla] || 0) + 1;
    return { c, semilla, total: Object.values(c).reduce((a, b) => a + b, 0) };
  }
  function resultado(p, materia) {
    const { c, semilla, total } = conteo(p, materia);
    if (!total) return null;
    const max = Math.max(...Object.values(c));
    const empatados = Object.keys(c).filter((k) => c[k] === max);
    return empatados.includes(semilla) ? semilla : empatados.includes("neutro") ? "neutro" : empatados[0];
  }
  function opinionDe(nombre, materia) {
    const p = profeInfo(nombre);
    return p ? resultado(p, materia) : null;
  }
  const opIcon = (nombre, materia) => {
    const o = opinionDe(nombre, materia);
    return o ? `<span class="op" title="${esc(OP[o].titulo.replace(/s$/, ""))}">${OP[o].icon}</span>` : "";
  };

  function renderProfes() {
    const mat = state.profMateria;
    const materias = [...new Set(state.profes.flatMap((p) => p.dicta))].sort((a, b) => a.localeCompare(b, "es"));
    const lista = state.profes.filter((p) => !mat || p.dicta.includes(mat));
    const grupos = { "recomendado": [], "neutro": [], "no recomendado": [], depende: [], sin: [] };
    for (const p of lista) {
      const tieneVotos = Object.keys(state.votos[p.nombre] || {}).length > 0;
      const porMateria = !mat && !p.general && Object.keys(p.materias).length;
      const o = porMateria && !tieneVotos ? null : resultado(p, mat);
      if (o) grupos[o].push(p);
      else if (porMateria) grupos.depende.push(p);
      else grupos.sin.push(p);
    }
    const votar = (p) => {
      const { c } = conteo(p, mat), mio = state.misVotos[p.nombre];
      return `<div class="votar" role="group" aria-label="Votar a ${esc(p.nombre)}">${[["recomendado", "👍", "Lo recomiendo"], ["neutro", "😐", "Neutro"], ["no recomendado", "👎", "No lo recomiendo"]]
        .map(([v, ic, t]) => `<button class="voto ${mio === v ? "on" : ""}" data-votar="${esc(p.nombre)}" data-voto="${v}" title="${t}" aria-pressed="${mio === v}">${ic} ${c[v] || 0}</button>`).join("")}</div>`;
    };
    const tarjeta = (p) => `<div class="profe">
        <strong>${esc(p.nombre)}</strong>
        <div class="mat-chips">${p.dicta.map((m) => {
          const o = p.materias[m] || p.general;
          return `<a class="mat-chip" href="#${encodeURIComponent(m)}/${encodeURIComponent(p.nombre)}" title="Ver sus parciales de ${esc(m)}">${o ? OP[o].icon + " " : ""}${esc(m)}</a>`;
        }).join("")}</div>
        ${p.comentario ? `<p>“${esc(p.comentario)}”</p>` : ""}
        ${votar(p)}
      </div>`;
    const col = (key, titulo, clase) => `<div class="profes-col ${clase}">
        <h3>${titulo} <span class="count">${grupos[key].length}</span></h3>
        ${grupos[key].length ? grupos[key].map(tarjeta).join("") : `<p class="profes-vacio">Nadie por ahora.</p>`}
      </div>`;
    $("#grid").innerHTML = `
      <p class="profes-intro">Opiniones de estudiantes, para orientarte. <b>Votá vos también</b> con 👍 😐 👎: cada profe queda en la columna que elija la mayoría. Podés cambiar tu voto cuando quieras (tocá el mismo botón para sacarlo). Elegí una materia para ver la opinión de esa materia.</p>
      <div class="profes-filtro"><label for="prof-mat">Ver opinión para:</label>
        <select id="prof-mat"><option value="">Todas las materias</option>${materias.map((m) => `<option ${m === mat ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="profes-cols">
        ${Object.entries(OP).map(([k, v]) => col(k, `${v.icon} ${v.titulo}`, v.clase)).join("")}
      </div>
      ${grupos.depende.length ? `<div class="profes-cols" style="margin-top:14px">${col("depende", "🔀 Depende de la materia", "depende")}</div>` : ""}
      ${grupos.sin.length ? `<div class="profes-cols sin-cols" style="margin-top:14px">${col("sin", "🗳️ Sin opiniones todavía — ¡votá!", "sin-op")}</div>` : ""}`;
    $("#empty").hidden = true;
    $("#prof-mat").onchange = (e) => { state.profMateria = e.target.value; renderProfes(); };
  }
  function go(m = "", p = "") {
    location.hash = m ? [m, p].filter(Boolean).map(encodeURIComponent).join("/") : "";
  }

  // ---------- Render ----------
  function tree() {
    const t = {};
    for (const d of state.docs) ((t[d.materia] ||= {})[d.profesor] ||= []).push(d);
    return t;
  }

  function renderSidebar() {
    const t = tree();
    const materias = Object.keys(t).sort((a, b) => a.localeCompare(b, "es"));
    $("#sidebar").innerHTML =
      `<button class="side-all ${!state.materia && state.vista === "docs" ? "active-nav" : ""}" data-m="">Todas las materias <span class="count">${materias.length}</span></button>` +
      materias.map((m) => {
        // "Otros" (profe desconocido) siempre al final
        const profs = Object.keys(t[m]).sort((a, b) => (a === "Otros") - (b === "Otros") || a.localeCompare(b, "es"));
        const total = profs.reduce((n, p) => n + t[m][p].length, 0);
        const open = state.materia === m;
        return `<div class="materia ${open ? "open" : ""}">
          <button class="materia-btn ${open && !state.profesor ? "active-nav" : ""}" data-m="${esc(m)}">
            <span><span class="caret">▸</span>${esc(m)}</span><span class="count">${total}</span></button>
          <div class="profs">${profs.map((p) => `
            <button class="prof-btn ${open && state.profesor === p ? "active-nav" : ""}" data-m="${esc(m)}" data-p="${esc(p)}">
              <span>${esc(p)}${opIcon(p, m)}</span> <span class="count">${t[m][p].length}</span></button>`).join("")}
          </div></div>`;
      }).join("");
  }

  function renderCrumbs() {
    const parts = [`<a href="#">Inicio</a>`];
    if (state.vista === "profes") parts.push(`<span>Profesores</span>`);
    if (state.vista === "subir") parts.push(`<span>Subir parcial</span>`);
    if (state.vista === "sugerir") parts.push(`<span>Sugerencias</span>`);
    if (state.materia) parts.push(`<a href="#${encodeURIComponent(state.materia)}">${esc(state.materia)}</a>`);
    if (state.profesor) parts.push(`<span>${esc(state.profesor)}</span>`);
    $("#crumbs").innerHTML = parts.join(" &nbsp;/&nbsp; ");
  }

  // Todas las palabras de la búsqueda tienen que aparecer (en cualquier orden)
  const matches = (texto, q) => { const t = norm(texto); return q.split(/\s+/).every((w) => t.includes(w)); };

  // Buscando desde el inicio: primero las carpetas de materias y profes que coinciden, después los archivos sueltos
  function resultadosBusqueda(list) {
    const q = norm(state.q.trim()), t = tree();
    const mats = state.materia ? [] : Object.keys(t).filter((m) => matches(m, q)).sort((a, b) => a.localeCompare(b, "es"));
    const profs = [];
    for (const m of (state.materia ? [state.materia] : Object.keys(t)))
      for (const p of Object.keys(t[m])) if (p !== "Otros" && matches(p, q) && !(state.profesor && p === state.profesor)) profs.push([m, p]);
    // Archivos: solo los que coinciden por su propio nombre, no por estar dentro de una materia/profe que ya mostramos como carpeta
    const tapados = new Set([...mats, ...profs.map(([m, p]) => m + "|" + p)]);
    const sueltos = list.filter((d) => !tapados.has(d.materia) && !tapados.has(d.materia + "|" + d.profesor));
    let html = "";
    if (mats.length) html += `<h3 class="tiles-title">Materias</h3><div class="tiles">${mats.map((m) => folderTile(m, Object.values(t[m]).flat().length, m)).join("")}</div>`;
    if (profs.length) html += `<h3 class="tiles-title">Profesores</h3><div class="tiles">${profs.map(([m, p]) => folderTile(`${p} — ${m}`, t[m][p].length, m, p)).join("")}</div>`;
    if (sueltos.length) html += `${html ? `<h3 class="tiles-title">Archivos</h3>` : ""}${state.modo === "carpetas" ? asTiles(sueltos, fileTile) : `<div class="grid">${sueltos.map(card).join("")}</div>`}`;
    return { html, total: mats.length + profs.length + sueltos.length };
  }

  function visibleDocs() {
    const q = norm(state.q.trim());
    let list = state.docs.filter((d) =>
      (!state.materia || d.materia === state.materia) &&
      (!state.profesor || d.profesor === state.profesor) &&
      (!state.tipo || d.tipo === state.tipo) &&
      (!q || matches(`${d.titulo} ${d.materia} ${d.profesor} ${d.tipo} ${d.anio || ""}`, q)));
    const st = (d, k) => (state.stats[d.id] || {})[k] || 0;
    const sorters = {
      recientes: (a, b) => cuando(b).localeCompare(cuando(a)),
      likes: (a, b) => st(b, "likes") - st(a, "likes"),
      descargas: (a, b) => st(b, "descargas") - st(a, "descargas"),
      nombre: (a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }),
    };
    return list.sort(sorters[state.sort]);
  }

  // Fecha del examen para mostrar: "15/04/2026", "16/09" o solo el año
  function fechaTexto(d) {
    const f = d.fecha_examen;
    if (f && f.length === 10) return `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
    if (f) return `${f.slice(3)}/${f.slice(0, 2)}${d.anio ? "/" + d.anio : ""}`;
    return d.anio ? String(d.anio) : "";
  }
  // Clave para ordenar por fecha del examen (y si no hay, por fecha de subida)
  const cuando = (d) => `${d.anio || "0000"}-${(d.fecha_examen || "").slice(-5) || "00-00"}|${d.subido || ""}`;

  function card(d) {
    const s = state.stats[d.id] || {};
    const on = !!state.liked[d.id];
    return `<article class="card">
      <div class="card-top"><h3>${esc(d.titulo)}</h3><span class="badge ${esc(d.tipo)}">${esc(d.tipo)}</span></div>
      <div class="meta">
        <div>📘 ${esc(d.materia)}</div>
        <div>👤 ${d.profesor === "Otros" ? '<span title="Profesor desconocido">Otros</span>' : esc(d.profesor) + opIcon(d.profesor, d.materia)}</div>
        ${fechaTexto(d) ? `<div>📅 ${esc(fechaTexto(d))}</div>` : ""}
        <div>📄 ${d.paginas ? d.paginas + " pág. · " : ""}${size(d.tamano)}${s.descargas ? ` · ⬇ ${s.descargas}` : ""}</div>
      </div>
      <div class="actions">
        <button class="btn small ghost" data-view="${esc(d.id)}">Ver</button>
        <a class="btn small" href="${esc(d.archivo)}" download data-dl="${esc(d.id)}">Descargar</a>
        <button class="like ${on ? "on" : ""}" data-like="${esc(d.id)}" aria-pressed="${on}" title="Me sirvió">${on ? "♥" : "♡"} ${s.likes || 0}</button>
      </div>
    </article>`;
  }

  // Secciones: Parciales (1er, 2do…), Recuperatorios (1er, 2do…), Finales, Apuntes, Otros
  const SECCIONES = [
    ["Parcial", "Parciales", "Parcial"], ["Recuperatorio", "Recuperatorios", "Recuperatorio"],
    ["Final", "Finales"], ["Apunte", "Apuntes"], ["Otro", "Otros"],
  ];
  const ordinal = (n) => ({ 1: "1er", 2: "2do", 3: "3er", 4: "4to" }[n] || n + "°");

  // Una sección por tipo (Parciales, Recuperatorios…), con subsecciones 1er / 2do
  // Vista carpetas: cada documento como un archivo de Drive
  function fileTile(d) {
    const s = state.stats[d.id] || {}, on = !!state.liked[d.id];
    const meta = [fechaTexto(d), d.paginas ? d.paginas + " pág." : "", state.profesor ? "" : d.profesor].filter(Boolean).join(" · ");
    return `<div class="tile">
      <button class="tile-main" data-view="${esc(d.id)}" title="${esc(d.titulo)}">
        <span class="tile-icon">📄</span>
        <span class="tile-text"><span class="tile-name">${esc(d.titulo)}</span><span class="tile-meta">${esc(meta)}</span></span>
      </button>
      <a class="tile-act" href="${esc(d.archivo)}" download data-dl="${esc(d.id)}" title="Descargar" aria-label="Descargar">⬇</a>
      <button class="tile-act like-mini ${on ? "on" : ""}" data-like="${esc(d.id)}" title="Me sirvió" aria-pressed="${on}">${on ? "♥" : "♡"}${s.likes ? " " + s.likes : ""}</button>
    </div>`;
  }
  const folderTile = (nombre, n, m, p) => `<button class="tile" data-m="${esc(m)}"${p !== undefined ? ` data-p="${esc(p)}"` : ""}>
      <span class="tile-icon">📁</span><span class="tile-text"><span class="tile-name">${esc(nombre)}${p !== undefined && p !== "Otros" ? opIcon(p, m) : ""}</span></span>
      <span class="count">${n}</span></button>`;
  const asTiles = (docs, render) => render === fileTile ? `<div class="tiles">${docs.map(fileTile).join("")}</div>` : `<div class="grid">${docs.map(render).join("")}</div>`;

  function carpetas(list) {
    if (!state.materia) {   // Inicio: una carpeta por materia
      const t = tree();
      return `<div class="tiles">${Object.keys(t).sort((a, b) => a.localeCompare(b, "es")).map((m) => {
        const n = list.filter((d) => d.materia === m).length;
        return n ? folderTile(m, n, m) : "";
      }).join("")}</div>`;
    }
    if (!state.profesor) {  // Materia: una carpeta por profe
      const profs = [...new Set(list.map((d) => d.profesor))].sort((a, b) => (a === "Otros") - (b === "Otros") || a.localeCompare(b, "es"));
      return `<h3 class="tiles-title">Profesores</h3><div class="tiles">${profs.map((p) =>
        folderTile(p, list.filter((d) => d.profesor === p).length, state.materia, p)).join("")}</div>`;
    }
    return grouped(list, fileTile);  // Profe: sus archivos, por año
  }

  function porTipo(list, render = card) {
    return SECCIONES.map(([tipo, titulo, singular]) => {
      const docs = list.filter((d) => d.tipo === tipo);
      if (!docs.length) return "";
      let body;
      if (singular) {
        const nums = [...new Set(docs.map((d) => d.numero ?? null))].sort((a, b) => (a ?? 99) - (b ?? 99));
        const conNumero = nums.some((n) => n !== null);
        body = nums.map((n) => {
          const sub = docs.filter((d) => (d.numero ?? null) === n);
          const label = n === null ? (conNumero ? `${titulo} (sin número)` : "") : `${ordinal(n)} ${singular}`;
          return `<div class="subsection">${label ? `<h4>${esc(label)}</h4>` : ""}${asTiles(sub, render)}</div>`;
        }).join("");
      } else {
        body = asTiles(docs, render);
      }
      return `<section class="section"><h3>${titulo} <span class="count">${docs.length}</span></h3>${body}</section>`;
    }).join("");
  }

  // Dentro de una materia: primero por año (el más nuevo arriba, "Sin fecha" al final)
  function grouped(list, render = card) {
    const anios = [...new Set(list.map((d) => d.anio ?? null))].sort((a, b) => (b ?? -1) - (a ?? -1));
    return anios.map((anio) => {
      const docs = list.filter((d) => (d.anio ?? null) === anio);
      return `<section class="year">
        <h2 class="year-title">${anio ?? "Sin fecha"} <span class="count">${docs.length}</span></h2>
        ${porTipo(docs, render)}
      </section>`;
    }).join("");
  }

  function renderGrid() {
    if (state.vista === "profes") return renderProfes();
    if (state.vista === "subir") return renderSubir();
    if (state.vista === "sugerir") return renderSugerir();
    const list = visibleDocs();
    document.querySelectorAll(".view-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.modo === state.modo));
    const buscando = !!state.q.trim();
    if (buscando && !state.profesor) {
      const r = resultadosBusqueda(list);
      $("#grid").innerHTML = r.html;
      $("#empty").hidden = r.total > 0;
      $("#empty").textContent = "No se encontró nada con esa búsqueda.";
      return;
    }
    if (state.modo === "carpetas") {
      // Estilo Drive: carpetas de materias → carpetas de profes → archivos. Buscando: archivos sueltos
      $("#grid").innerHTML = buscando ? asTiles(list, fileTile) : carpetas(list);
    } else {
      // Lista: dentro de una materia se agrupa por año y secciones; en "Todas" o buscando, lista simple
      $("#grid").innerHTML = state.materia && !buscando ? grouped(list) : `<div class="grid">${list.map(card).join("")}</div>`;
    }
    $("#empty").hidden = list.length > 0;
    $("#empty").textContent = state.docs.length ? "No se encontró nada con esos filtros." : "Todavía no hay documentos.";
  }

  function renderStats() {
    const materias = new Set(state.docs.map((d) => d.materia)).size;
    const profes = new Set(state.docs.map((d) => d.materia + "|" + d.profesor)).size;
    const parciales = state.docs.filter((d) => d.tipo === "Parcial").length;
    $("#stats").innerHTML = [
      [state.docs.length, "documento", "documentos"], [parciales, "parcial", "parciales"],
      [materias, "materia", "materias"], [profes, "profesor", "profesores"],
    ].map(([n, uno, varios]) => `<span class="stat"><b>${n}</b> ${n === 1 ? uno : varios}</span>`).join("");
  }

  function renderChips() {
    const scope = state.docs.filter((d) => (!state.materia || d.materia === state.materia) && (!state.profesor || d.profesor === state.profesor));
    const tipos = new Set(scope.map((d) => d.tipo));
    document.querySelectorAll(".chip").forEach((c) => { c.hidden = c.dataset.tipo !== "" && !tipos.has(c.dataset.tipo); });
    if (state.tipo && !tipos.has(state.tipo)) {
      state.tipo = "";
      document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.tipo === ""));
    }
  }

  function render() {
    renderSidebar(); renderCrumbs();
    const profes = state.vista === "profes", extra = state.vista !== "docs";
    $("#toolbar").hidden = extra;
    $("#nav-profes").classList.toggle("active", profes);
    $("#nav-subir").classList.toggle("active", state.vista === "subir");
    $("#nav-sugerencias").classList.toggle("active", state.vista === "sugerir");
    document.body.classList.toggle("vista-profes", extra);
    if (extra) return renderGrid();
    renderChips(); renderGrid();
  }

  // ---------- Eventos ----------
  document.addEventListener("click", async (e) => {
    const nav = e.target.closest("[data-m]");
    if (nav) {
      const m = nav.dataset.m, p = nav.dataset.p || "";
      if (state.q.trim() && m) { state.q = ""; $("#q").value = ""; }
      if (!p && m && state.materia === m && !state.profesor) go(""); // toggle
      else go(m, p);
      return;
    }
    const vb = e.target.closest("[data-votar]");
    if (vb) { votarProfe(vb.dataset.votar, vb.dataset.voto); return; }
    const like = e.target.closest("[data-like]");
    if (like) {
      const id = like.dataset.like, was = !!state.liked[id];
      if (was) delete state.liked[id]; else state.liked[id] = 1;
      save("liked", state.liked);
      like.classList.add("pop"); setTimeout(() => like.classList.remove("pop"), 300);
      bump(id, "likes", was ? -1 : 1).then(renderGrid);
      renderGrid();
      return;
    }
    const dl = e.target.closest("[data-dl]");
    if (dl) { bump(dl.dataset.dl, "descargas", 1); return; }
    const view = e.target.closest("[data-view]");
    if (view) openViewer(state.docs.find((x) => x.id === view.dataset.view));
  });

  // ---------- Subir parciales y sugerencias (quedan guardados en Supabase para revisarlos) ----------
  const storage = (path, opts) => fetch(`${CFG.supabaseUrl}/storage/v1/object/${path}`, {
    ...opts, headers: { apikey: CFG.supabaseAnonKey, ...(CFG.supabaseAnonKey.startsWith("sb_") ? {} : { Authorization: `Bearer ${CFG.supabaseAnonKey}` }), ...(opts.headers || {}) },
  });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const limpio = (n) => norm(n).replace(/[^a-z0-9._-]+/g, "-").slice(-80) || "archivo";
  const sinBackend = `<p class="form-msg err">Esta función necesita la base de datos configurada.</p>`;

  function renderSubir() {
    const materias = Object.keys(tree()).sort((a, b) => a.localeCompare(b, "es"));
    $("#empty").hidden = true;
    $("#grid").innerHTML = `<section class="form-page">
      <h2>📤 Subí tus parciales</h2>
      <p>Mandanos fotos o PDFs de parciales, finales, recuperatorios o apuntes de la <b>UP</b>. Los revisamos, tapamos los datos personales y los ordenamos en la página.</p>
      <p class="aviso">🔒 Si podés, <b>tapá tu nombre, legajo y firma</b> antes de sacar la foto. Igual los revisamos antes de publicar: nada se publica sin que lo veamos.</p>
      ${REMOTE ? `<form id="form-subir" class="form">
        <label>Materia *<input name="materia" list="lista-materias" required maxlength="120" placeholder="Ej: Álgebra"></label>
        <datalist id="lista-materias">${materias.map((m) => `<option value="${esc(m)}">`).join("")}</datalist>
        <div class="form-row">
          <label>Profesor <small>(en lo posible)</small><input name="profesor" maxlength="120" placeholder="Ej: Juan Pérez"></label>
          <label>Año del examen <small>(en lo posible)</small><input name="anio" maxlength="20" inputmode="numeric" placeholder="Ej: 2026"></label>
        </div>
        <label>Qué es
          <select name="tipo"><option>1er Parcial</option><option>2do Parcial</option><option>1er Recuperatorio</option><option>2do Recuperatorio</option><option>Final</option><option>Apunte / resumen</option><option>Otro</option></select></label>
        <label>Archivos * <small>(fotos o PDF, hasta 15 MB cada uno, máximo 20)</small>
          <input name="archivos" type="file" multiple required accept="image/*,application/pdf"></label>
        <label>Comentario <small>(opcional: tema, fecha exacta, si tiene resolución…)</small><textarea name="comentario" maxlength="1000" rows="3"></textarea></label>
        <button class="btn" type="submit">Enviar</button>
        <div id="subir-msg" aria-live="polite"></div>
      </form>` : sinBackend}
    </section>`;
    const f = $("#form-subir"); if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const msg = $("#subir-msg"), btn = f.querySelector("button");
      const files = [...f.archivos.files];
      if (files.length > 20) { msg.innerHTML = `<p class="form-msg err">Máximo 20 archivos por envío.</p>`; return; }
      const grande = files.find((x) => x.size > 15 * 1048576);
      if (grande) { msg.innerHTML = `<p class="form-msg err">"${esc(grande.name)}" pesa más de 15 MB.</p>`; return; }
      btn.disabled = true;
      try {
        const carpeta = `pendientes/${new Date().toISOString().slice(0, 10)}-${uid()}`, rutas = [];
        for (const [i, file] of files.entries()) {
          msg.innerHTML = `<p class="form-msg">Subiendo ${i + 1} de ${files.length}…</p>`;
          const ruta = `${carpeta}/${String(i + 1).padStart(2, "0")}-${limpio(file.name)}`;
          const r = await storage(`envios/${ruta}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
          if (!r.ok) throw new Error(`No se pudo subir "${file.name}" (${r.status}). Solo se aceptan fotos y PDF.`);
          rutas.push(ruta);
        }
        const v = (k) => f[k].value.trim() || null;
        const r = await api("envios", { method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ materia: v("materia"), profesor: v("profesor"), anio: v("anio"), tipo: v("tipo"), comentario: v("comentario"), archivos: rutas }) });
        if (!r.ok) throw new Error("No se pudo guardar el envío.");
        f.reset();
        msg.innerHTML = `<p class="form-msg ok">¡Gracias! 🙌 Recibimos ${rutas.length} archivo(s). Los vamos a revisar y subir a la página.</p>`;
      } catch (err) {
        msg.innerHTML = `<p class="form-msg err">${esc(err.message)} Probá de nuevo en un rato.</p>`;
      } finally { btn.disabled = false; }
    };
  }

  function renderSugerir() {
    $("#empty").hidden = true;
    $("#grid").innerHTML = `<section class="form-page">
      <h2>💡 ¿Cómo mejoramos la página?</h2>
      <p>Contanos qué <b>agregarías</b>, qué <b>cambiarías</b> o qué <b>sacarías</b>. Todo sirve: materias que faltan, cosas que no se entienden, errores, ideas nuevas.</p>
      ${REMOTE ? `<form id="form-sugerir" class="form">
        <fieldset class="opciones"><legend>Tu idea es para…</legend>
          <label><input type="radio" name="tipo" value="agregar" checked> ➕ Agregar algo</label>
          <label><input type="radio" name="tipo" value="cambiar"> ✏️ Cambiar algo</label>
          <label><input type="radio" name="tipo" value="sacar"> ➖ Sacar algo</label>
          <label><input type="radio" name="tipo" value="otro"> 💬 Otro</label>
        </fieldset>
        <label>Tu sugerencia *<textarea name="texto" required minlength="3" maxlength="2000" rows="5" placeholder="Ej: estaría bueno poder filtrar por año…"></textarea></label>
        <p class="aviso">Es anónimo: no pongas datos personales.</p>
        <button class="btn" type="submit">Enviar sugerencia</button>
        <div id="sugerir-msg" aria-live="polite"></div>
      </form>` : sinBackend}
    </section>`;
    const f = $("#form-sugerir"); if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const msg = $("#sugerir-msg"), btn = f.querySelector("button"); btn.disabled = true;
      try {
        const r = await api("sugerencias", { method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ tipo: f.tipo.value, texto: f.texto.value.trim() }) });
        if (!r.ok) throw new Error();
        f.reset(); msg.innerHTML = `<p class="form-msg ok">¡Gracias por la idea! 💜 La vamos a leer.</p>`;
      } catch { msg.innerHTML = `<p class="form-msg err">No se pudo enviar. Probá de nuevo en un rato.</p>`; }
      finally { btn.disabled = false; }
    };
  }

  // ---------- Visor de PDF (PDF.js: funciona también en Android/iPhone) ----------
  let pdfjsReady, viewToken = 0;
  function loadPdfJs() {
    return (pdfjsReady ||= new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "vendor/pdf.min.js";
      s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; ok(pdfjsLib); };
      s.onerror = fail;
      document.head.appendChild(s);
    }));
  }
  async function openViewer(d) {
    const token = ++viewToken, box = $("#viewer-pages");
    $("#viewer-title").textContent = `${d.titulo} — ${d.profesor}`;
    const a = $("#viewer-dl"); a.href = d.archivo; a.dataset.dl = d.id;
    box.innerHTML = `<p class="viewer-msg">Cargando…</p>`;
    $("#viewer").showModal();
    try {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument(d.archivo).promise;
      if (token !== viewToken) return;
      box.innerHTML = "";
      const width = Math.min(box.clientWidth - 24, 900) * (window.devicePixelRatio || 1);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        if (token !== viewToken) return;
        const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.setAttribute("aria-label", `Página ${i} de ${pdf.numPages}`);
        box.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      }
    } catch (err) {
      console.warn(err);
      if (token === viewToken) box.innerHTML = `<p class="viewer-msg">No se pudo mostrar la vista previa.<br>Usá el botón Descargar.</p>`;
    }
  }
  $("#viewer-close").onclick = () => $("#viewer").close();
  $("#viewer").addEventListener("close", () => { viewToken++; $("#viewer-pages").innerHTML = ""; });

  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
    state.tipo = c.dataset.tipo; renderGrid();
  });
  $("#sort").onchange = (e) => { state.sort = e.target.value; renderGrid(); };
  document.querySelector(".view-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("[data-modo]"); if (!b) return;
    state.modo = b.dataset.modo; save("modo", state.modo); renderGrid();
  });
  $("#q").oninput = (e) => {
    state.q = e.target.value;
    if (state.vista !== "docs" && state.q.trim()) { go(""); return; }
    renderGrid();
  };
  window.addEventListener("hashchange", () => { readHash(); render(); });

  // Tema
  const theme = load("theme", "");
  if (theme) document.documentElement.dataset.theme = theme;
  $("#theme").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    save("theme", document.documentElement.dataset.theme);
  };

  if (CFG.githubRepo) $("#contrib").href = `https://github.com/${CFG.githubRepo}`;
  else $("#contrib").removeAttribute("href");

  // ---------- Inicio ----------
  (async () => {
    try {
      const data = await (await fetch("data.json", { cache: "no-cache" })).json();
      state.docs = data.documentos || [];
      state.profes = data.profesores || [];
    } catch { state.docs = []; }
    readHash();
    renderStats();
    render();
    await Promise.all([loadStats(), loadVotos()]);
    render();
  })();
})();
