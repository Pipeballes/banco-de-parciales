(() => {
  const CFG = window.APUNTES_CONFIG || {};
  const REMOTE = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const $ = (s) => document.querySelector(s);

  const state = { docs: [], stats: {}, liked: load("liked", {}), materia: "", profesor: "", tipo: "", q: "", sort: "recientes" };

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
    const [m = "", p = ""] = location.hash.slice(1).split("/").map(decodeURIComponent);
    state.materia = m; state.profesor = p;
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
      `<button class="side-all ${!state.materia ? "active-nav" : ""}" data-m="">Todas las materias <span class="count">${state.docs.length}</span></button>` +
      materias.map((m) => {
        const profs = Object.keys(t[m]).sort((a, b) => a.localeCompare(b, "es"));
        const total = profs.reduce((n, p) => n + t[m][p].length, 0);
        const open = state.materia === m;
        return `<div class="materia ${open ? "open" : ""}">
          <button class="materia-btn ${open && !state.profesor ? "active-nav" : ""}" data-m="${esc(m)}">
            <span><span class="caret">▸</span>${esc(m)}</span><span class="count">${total}</span></button>
          <div class="profs">${profs.map((p) => `
            <button class="prof-btn ${open && state.profesor === p ? "active-nav" : ""}" data-m="${esc(m)}" data-p="${esc(p)}">
              ${esc(p)} <span class="count">${t[m][p].length}</span></button>`).join("")}
          </div></div>`;
      }).join("");
  }

  function renderCrumbs() {
    const parts = [`<a href="#">Inicio</a>`];
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
      (!q || norm(`${d.titulo} ${d.materia} ${d.profesor} ${d.tipo}`).includes(q)));
    const st = (d, k) => (state.stats[d.id] || {})[k] || 0;
    const sorters = {
      recientes: (a, b) => b.fecha.localeCompare(a.fecha),
      likes: (a, b) => st(b, "likes") - st(a, "likes"),
      descargas: (a, b) => st(b, "descargas") - st(a, "descargas"),
      nombre: (a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }),
    };
    return list.sort(sorters[state.sort]);
  }

  function card(d) {
    const s = state.stats[d.id] || {};
    const on = !!state.liked[d.id];
    return `<article class="card">
      <div class="card-top"><h3>${esc(d.titulo)}</h3><span class="badge ${esc(d.tipo)}">${esc(d.tipo)}</span></div>
      <div class="meta">
        <div>📘 ${esc(d.materia)}</div>
        <div>👤 ${esc(d.profesor)}</div>
        <div>📄 ${d.paginas ? d.paginas + " pág. · " : ""}${size(d.tamano)}${s.descargas ? ` · ⬇ ${s.descargas}` : ""}</div>
      </div>
      <div class="actions">
        <button class="btn small ghost" data-view="${esc(d.id)}">Ver</button>
        <a class="btn small" href="${esc(d.archivo)}" download data-dl="${esc(d.id)}">Descargar</a>
        <button class="like ${on ? "on" : ""}" data-like="${esc(d.id)}" aria-pressed="${on}" title="Me sirvió">${on ? "♥" : "♡"} ${s.likes || 0}</button>
      </div>
    </article>`;
  }

  function renderGrid() {
    const list = visibleDocs();
    $("#grid").innerHTML = list.map(card).join("");
    $("#empty").hidden = list.length > 0;
    $("#empty").textContent = state.docs.length ? "No se encontró nada con esos filtros." : "Todavía no hay documentos. ¡Subí las primeras fotos a la carpeta fotos/!";
  }

  function renderStats() {
    const materias = new Set(state.docs.map((d) => d.materia)).size;
    const profes = new Set(state.docs.map((d) => d.materia + "|" + d.profesor)).size;
    const parciales = state.docs.filter((d) => d.tipo === "Parcial").length;
    $("#stats").innerHTML = [
      [state.docs.length, "documentos"], [parciales, "parciales"], [materias, "materias"], [profes, "profesores"],
    ].map(([n, l]) => `<span class="stat"><b>${n}</b> ${l}</span>`).join("");
  }

  function render() { renderSidebar(); renderCrumbs(); renderGrid(); }

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
    } catch { state.docs = []; }
    readHash();
    renderStats();
    render();
    await loadStats();
    renderGrid();
  })();
})();
