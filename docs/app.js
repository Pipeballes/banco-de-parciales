(() => {
  const CFG = window.APUNTES_CONFIG || {};
  const REMOTE = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const $ = (s) => document.querySelector(s);

  const state = { docs: [], profes: [], stats: {}, liked: load("liked", {}), materia: "", profesor: "", tipo: "", q: "", sort: "recientes", vista: "docs", profMateria: "" };

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

  // ---------- Navegación (hash: #materia/profesor) ----------
  function readHash() {
    if (location.hash === "#profesores") { state.vista = "profes"; state.materia = state.profesor = ""; return; }
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
  function opinionDe(nombre, materia) {
    const p = profeInfo(nombre);
    if (!p) return null;
    return (materia && p.materias[materia]) || p.general || null;
  }
  const opIcon = (nombre, materia) => {
    const o = opinionDe(nombre, materia);
    return o ? `<span class="op" title="${esc(OP[o].titulo.replace(/s$/, ""))}${materia && profeInfo(nombre).materias[materia] ? " en " + esc(materia) : ""}">${OP[o].icon}</span>` : "";
  };

  function renderProfes() {
    const mat = state.profMateria;
    const materias = [...new Set(state.profes.flatMap((p) => p.dicta))].sort((a, b) => a.localeCompare(b, "es"));
    const lista = state.profes.filter((p) => !mat || p.dicta.includes(mat));
    const grupos = { "recomendado": [], "neutro": [], "no recomendado": [], depende: [], sin: [] };
    for (const p of lista) {
      const o = mat ? (p.materias[mat] || p.general) : p.general;
      if (o) grupos[o].push(p);
      else if (!mat && Object.keys(p.materias).length) grupos.depende.push(p);
      else grupos.sin.push(p);
    }
    const tarjeta = (p) => `<div class="profe">
        <strong>${esc(p.nombre)}</strong>
        <div class="mat-chips">${p.dicta.map((m) => {
          const o = p.materias[m] || p.general;
          return `<a class="mat-chip" href="#${encodeURIComponent(m)}/${encodeURIComponent(p.nombre)}" title="Ver sus parciales de ${esc(m)}">${o ? OP[o].icon + " " : ""}${esc(m)}</a>`;
        }).join("")}</div>
        ${p.comentario ? `<p>“${esc(p.comentario)}”</p>` : ""}
      </div>`;
    const col = (key, titulo, clase) => `<div class="profes-col ${clase}">
        <h3>${titulo} <span class="count">${grupos[key].length}</span></h3>
        ${grupos[key].length ? grupos[key].map(tarjeta).join("") : `<p class="profes-vacio">Nadie por ahora.</p>`}
      </div>`;
    $("#grid").innerHTML = `
      <p class="profes-intro">Opiniones de estudiantes, para orientarte. Un profe puede ser recomendado en una materia y no en otra: elegí la materia para ver la opinión que corresponde.</p>
      <div class="profes-filtro"><label for="prof-mat">Ver opinión para:</label>
        <select id="prof-mat"><option value="">Todas las materias</option>${materias.map((m) => `<option ${m === mat ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="profes-cols">
        ${Object.entries(OP).map(([k, v]) => col(k, `${v.icon} ${v.titulo}`, v.clase)).join("")}
      </div>
      ${grupos.depende.length ? `<div class="profes-cols" style="margin-top:14px">${col("depende", "🔀 Depende de la materia", "depende")}</div>` : ""}
      ${grupos.sin.length ? `<p class="profes-sin">Sin opinión todavía: ${grupos.sin.map((p) => p.dicta.length ? `<a href="#${encodeURIComponent(p.dicta[0])}/${encodeURIComponent(p.nombre)}">${esc(p.nombre)}</a>` : esc(p.nombre)).join(", ")}.</p>` : ""}`;
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
      `<button class="side-all ${!state.materia && state.vista === "docs" ? "active-nav" : ""}" data-m="">Todas las materias <span class="count">${state.docs.length}</span></button>` +
      materias.map((m) => {
        // "??" (profe desconocido) siempre al final
        const profs = Object.keys(t[m]).sort((a, b) => (a === "??") - (b === "??") || a.localeCompare(b, "es"));
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
    if (state.materia) parts.push(`<a href="#${encodeURIComponent(state.materia)}">${esc(state.materia)}</a>`);
    if (state.profesor) parts.push(`<span>${esc(state.profesor)}</span>`);
    $("#crumbs").innerHTML = parts.join(" &nbsp;/&nbsp; ");
  }

  function visibleDocs() {
    const q = norm(state.q.trim());
    let list = state.docs.filter((d) =>
      (!state.materia || d.materia === state.materia) &&
      (!state.profesor || d.profesor === state.profesor) &&
      (!state.tipo || d.tipo === state.tipo) &&
      (!q || norm(`${d.titulo} ${d.materia} ${d.profesor} ${d.tipo} ${d.anio || ""}`).includes(q)));
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
        <div>👤 ${d.profesor === "??" ? '<span title="Profesor desconocido">??</span>' : esc(d.profesor) + opIcon(d.profesor, d.materia)}</div>
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
  function porTipo(list) {
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
          return `<div class="subsection">${label ? `<h4>${esc(label)}</h4>` : ""}<div class="grid">${sub.map(card).join("")}</div></div>`;
        }).join("");
      } else {
        body = `<div class="grid">${docs.map(card).join("")}</div>`;
      }
      return `<section class="section"><h3>${titulo} <span class="count">${docs.length}</span></h3>${body}</section>`;
    }).join("");
  }

  // Dentro de una materia: primero por año (el más nuevo arriba, "Sin fecha" al final)
  function grouped(list) {
    const anios = [...new Set(list.map((d) => d.anio ?? null))].sort((a, b) => (b ?? -1) - (a ?? -1));
    return anios.map((anio) => {
      const docs = list.filter((d) => (d.anio ?? null) === anio);
      return `<section class="year">
        <h2 class="year-title">${anio ?? "Sin fecha"} <span class="count">${docs.length}</span></h2>
        ${porTipo(docs)}
      </section>`;
    }).join("");
  }

  function renderGrid() {
    if (state.vista === "profes") return renderProfes();
    const list = visibleDocs();
    // Dentro de una materia se agrupa por secciones; en "Todas" o buscando, lista simple
    $("#grid").innerHTML = state.materia && !state.q.trim()
      ? grouped(list)
      : `<div class="grid">${list.map(card).join("")}</div>`;
    $("#empty").hidden = list.length > 0;
    $("#empty").textContent = state.docs.length ? "No se encontró nada con esos filtros." : "Todavía no hay documentos. ¡Subí las primeras fotos a la carpeta fotos/!";
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
    const profes = state.vista === "profes";
    $("#toolbar").hidden = profes;
    $("#nav-profes").classList.toggle("active", profes);
    document.body.classList.toggle("vista-profes", profes);
    if (profes) return renderProfes();
    renderChips(); renderGrid();
  }

  // ---------- Eventos ----------
  document.addEventListener("click", async (e) => {
    const nav = e.target.closest("[data-m]");
    if (nav) {
      const m = nav.dataset.m, p = nav.dataset.p || "";
      if (!p && m && state.materia === m && !state.profesor) go(""); // toggle
      else go(m, p);
      return;
    }
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
  $("#q").oninput = (e) => { state.q = e.target.value; renderGrid(); };
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
    await loadStats();
    renderGrid();
  })();
})();
