// Edge Function "ia": asistente del Banco de Parciales.
// Usa Gemini (plan gratis de Google) si existe el secreto GEMINI_API_KEY; si no, Claude con ANTHROPIC_API_KEY.
// Las claves viven SOLO como secretos de Supabase, nunca en la página.
// Límite diario por persona y total (tabla ia_config) para controlar el gasto.
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { encodeBase64 } from "jsr:@std/encoding@1.0.5/base64";

const SITIO = "https://pipeballes.github.io/banco-de-parciales/";
const ORIGENES = ["https://pipeballes.github.io"];
const MODELO = "claude-haiku-5-5"; // el más barato
const MAX_LECTURAS = 2; // PDFs que puede leer por consulta
const MAX_PDF = 5 * 1024 * 1024; // los más pesados no se leen (el plan gratis de Supabase tiene poco tiempo y memoria)
const TOPE_MS = 105_000; // tiempo máximo de trabajo por pregunta (Supabase corta a los 150 s)

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const CLAUDE_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const anthropic = CLAUDE_KEY ? new Anthropic() : null; // lee ANTHROPIC_API_KEY del entorno
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Pdf = { pdf: string; titulo: string };
type Doc = { id: string; titulo: string; materia: string; profesor: string; tipo: string; anio: number | null;
  fecha_examen: string | null; paginas: number | null; tamano: number; archivo: string };

let cache: { t: number; docs: Doc[]; drive: Record<string, string[] | string> } | null = null;
async function catalogo() {
  if (cache && Date.now() - cache.t < 10 * 60_000) return cache;
  const [d, dr] = await Promise.all([
    fetch(SITIO + "data.json").then((r) => r.json()),
    fetch(SITIO + "drive.json").then((r) => r.json()).catch(() => ({})),
  ]);
  cache = { t: Date.now(), docs: d.documentos, drive: dr };
  return cache;
}

const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nombreProfe = (p: string) => (p === "Sin profesor" ? "Otros" : p);
const urlDoc = (d: Doc) => SITIO + d.archivo.split("/").map(encodeURIComponent).join("/");
const urlCarpeta = (d: Doc) => SITIO + "#" + encodeURIComponent(d.materia) + "/" + encodeURIComponent(d.profesor); // carpeta dentro de la página

function buscar(docs: Doc[], consulta: string, materia?: string, tipo?: string) {
  const palabras = norm(consulta).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const m = materia ? norm(materia) : "";
  return docs
    .filter((d) => !m || norm(d.materia).includes(m) || m.includes(norm(d.materia)))
    .filter((d) => !tipo || norm(d.tipo).includes(norm(tipo)))
    .map((d) => {
      const texto = norm(`${d.titulo} ${d.materia} ${d.profesor} ${d.tipo} ${d.anio ?? ""}`);
      return { d, s: palabras.reduce((a, w) => a + (texto.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.s > 0 || !palabras.length || m)
    .sort((a, b) => b.s - a.s || (b.d.anio ?? 0) - (a.d.anio ?? 0))
    .slice(0, 25)
    .map(({ d }) => ({ id: d.id, titulo: d.titulo, materia: d.materia, profesor: nombreProfe(d.profesor), tipo: d.tipo,
      anio: d.anio ?? "Sin fecha", paginas: d.paginas, url_pdf: urlDoc(d), url_carpeta: urlCarpeta(d) }));
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "buscar_material",
    description: "Busca en el catálogo del Banco de Parciales (espejo revisado del Drive de la comunidad: parciales, finales, resúmenes y apuntes de alumnos, con datos personales tapados). Devuelve hasta 25 archivos con su id, link al PDF (url_pdf) y a la carpeta del profe dentro de la página (url_carpeta).",
    input_schema: { type: "object", properties: {
      consulta: { type: "string", description: "Palabras clave: tema, tipo de examen, año, profesor. Puede ir vacía para listar la materia." },
      materia: { type: "string", description: "Nombre de la materia, si se sabe." },
      tipo: { type: "string", description: "Opcional: Parcial, Final, Recuperatorio, Resumen, Apunte, etc." } },
      required: ["consulta"] } },
  { name: "leer_archivo",
    description: `Lee el contenido de un PDF del catálogo (por su id) para explicarlo, resolverlo, resumirlo o hacer ejercicios parecidos. Máximo ${MAX_LECTURAS} por consulta: elegí los más relevantes.`,
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "carpetas_drive",
    description: "Devuelve los links a las carpetas originales del Drive de una materia. Usalo SOLO si en la página (buscar_material) no hay lo que el alumno pide.",
    input_schema: { type: "object", properties: { materia: { type: "string" } }, required: ["materia"] } },
];

function sistema(materias: string[]) {
  return `Sos el asistente del "Banco de Parciales", una página hecha por alumnos de Ingeniería de la Universidad de Palermo (UP) para compartir parciales, finales, resúmenes y apuntes.

Qué hacés:
- Buscar material: cuando te piden material de una materia, usá buscar_material y devolvé los archivos con links en Markdown, [Título (año) — Profe](url_pdf). Agrupá por tipo si son muchos. Al final pasá la carpeta de la materia o del profe DENTRO de la página, [Materia — Profe](url_carpeta), para que vea todo ahí.
- Drive original: solo si en el catálogo de la página no hay nada de lo que pide, decilo y recién ahí pasá la carpeta del Drive con carpetas_drive. Nunca mandes al Drive si el material está en la página.
- Tutor: explicar y resolver ejercicios de un parcial paso a paso (usá leer_archivo para ver el PDF).
- Práctica: generar ejercicios nuevos al estilo de los parciales reales de esa materia/profe (leé 1 o 2 parciales primero), con la solución al final separada, para que el alumno intente antes.
- Resumen: resumir los temas que se toman en la materia, en base a los parciales y resúmenes del catálogo.

Reglas:
- Solo recomendá archivos que aparezcan en los resultados de las herramientas. Nunca inventes archivos, links, fechas ni profesores.
- PRIVACIDAD: nunca escribas nombres de alumnos, legajos, DNI, mails ni firmas, aunque aparezcan en un PDF. Los nombres de profesores sí se pueden decir. "Otros" significa profesor desconocido.
- Si un examen dice "(online)" en el título es que se tomó en pantalla.
- Respondé en español rioplatense, claro y directo. Usá Markdown simple (títulos cortos, listas, **negrita**). Para fórmulas usá texto plano o Unicode, no LaTeX.
- Si te preguntan algo que no tiene que ver con la facultad o el estudio, respondé breve y volvé al tema.
- Si la resolución de un parcial es tuya y no del original, aclaralo ("resolución propuesta, verificala").

Materias del catálogo: ${materias.join(", ")}.`;
}

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGENES.includes(origin) ? origin : ORIGENES[0],
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

async function quien(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const sal = Deno.env.get("IA_SAL") || Deno.env.get("SUPABASE_URL")!;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sal + "|" + ip));
  return encodeBase64(new Uint8Array(h)).slice(0, 22); // no se guarda la IP, solo un hash
}

// Modelos de Gemini a probar, en orden: el del secreto GEMINI_MODEL y los "flash" que ofrezca la cuenta
let modelosCache: string[] = [];
async function modelosGemini(): Promise<string[]> {
  if (modelosCache.length) return modelosCache;
  const fijo = (Deno.env.get("GEMINI_MODEL") || "").replace(/^models\//, "");
  let nombres: string[] = [];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": GEMINI_KEY } });
    const j = await r.json();
    nombres = (j.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""));
  } catch (e) { console.error(e); }
  const ver = (n: string) => parseFloat((n.match(/gemini-([\d.]+)/) || [])[1] || "0");
  const flash = nombres.filter((n) => /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
  const lite = nombres.filter((n) => /^gemini-[\d.]+-flash-lite$/.test(n)).sort((a, b) => ver(b) - ver(a));
  const alias = ["gemini-flash-latest", "gemini-flash-lite-latest"].filter((n) => nombres.includes(n));
  // Se alternan "flash" y "lite" (más liviano): si Google está saturado, el lite suele responder
  modelosCache = [...new Set([fijo, alias[0] || flash[0], alias[1] || lite[0], flash[0], lite[0], flash[1]].filter(Boolean) as string[])];
  if (!modelosCache.length) modelosCache = ["gemini-flash-latest"];
  console.log("Modelos Gemini:", modelosCache.join(", "));
  return modelosCache;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Llama a Gemini; si un modelo está saturado o tarda demasiado (25 s, o 45 s si lleva PDFs), prueba el siguiente
const saturados = new Map<string, number>(); // modelo -> hasta cuándo evitarlo
let pensarPoco = true;
async function llamarGemini(body: unknown, hasta: number): Promise<Response> {
  const ahora = Date.now();
  const modelos = (await modelosGemini()).slice().sort((a, b) => ((saturados.get(a) || 0) > ahora ? 1 : 0) - ((saturados.get(b) || 0) > ahora ? 1 : 0));
  // Modo rápido: que piense poco (si el modelo no lo acepta, se manda sin esa opción)
  const b: any = body;
  const conRapido = pensarPoco ? { ...b, generationConfig: { ...(b.generationConfig || {}), thinkingConfig: { thinkingLevel: "low" } } } : b;
  let texto = JSON.stringify(conRapido); // una sola vez: con PDFs es pesado
  let ultima: Response | null = null;
  for (const modelo of modelos) {
    for (let intento = 0; intento < 2; intento++) {
      if (Date.now() > hasta) return ultima ?? new Response("tiempo", { status: 504 });
      const t0 = Date.now();
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" }, body: texto,
        signal: AbortSignal.timeout(Math.max(5_000, Math.min(texto.length > 300_000 ? 45_000 : 25_000, hasta - Date.now()))) }).catch(() => new Response("tiempo", { status: 504 }));
      console.log("Gemini", modelo, r.status, `${((Date.now() - t0) / 1000).toFixed(1)}s`, `${Math.round(texto.length / 1024)}KB`);
      if (r.status === 400 && pensarPoco) {
        const err = await r.clone().text();
        if (/thinking/i.test(err)) { pensarPoco = false; texto = JSON.stringify(body); intento--; continue; }
      }
      if (![429, 500, 503, 504].includes(r.status)) return r;
      console.warn("Gemini", modelo, r.status, (await r.text()).slice(0, 200));
      saturados.set(modelo, Date.now() + 5 * 60_000);
      ultima = r;
      if (r.status === 429 || r.status === 504) break; // límite o colgado: probar el siguiente modelo
      await esperar(1000);
    }
  }
  return ultima ?? new Response("sin modelos", { status: 503 });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const H = { ...cors(origin), "Content-Type": "application/json" };
  const resp = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return resp({ error: "Método no permitido" }, 405);
  if (!origin || !ORIGENES.includes(origin)) return resp({ error: "Origen no permitido" }, 403);
  if (!GEMINI_KEY && !CLAUDE_KEY) return resp({ error: "La IA todavía no está configurada." }, 503);

  let body: { mensajes?: { role: string; content: string }[]; archivo?: string; modo?: string };
  try { body = await req.json(); } catch { return resp({ error: "Pedido inválido" }, 400); }
  const hist = (body.mensajes || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, m.role === "user" ? 2000 : 6000) }));
  while (hist.length && hist[0].role !== "user") hist.shift();
  if (!hist.length || hist[hist.length - 1].role !== "user") return resp({ error: "Falta la pregunta" }, 400);

  const { data: quedan, error: e1 } = await db.rpc("ia_consumir", { p_quien: await quien(req) });
  if (e1) { console.error(e1); return resp({ error: "No se pudo verificar el límite. Probá en un rato." }, 500); }
  if (quedan === -1) return resp({ error: "Llegaste al límite de consultas de hoy. ¡Volvé mañana! 💜" }, 429);
  if (quedan === -2) return resp({ error: "La IA llegó al límite de consultas de hoy para toda la página. Volvé mañana." }, 429);
  if (quedan === -3) return resp({ error: "La IA está pausada por ahora." }, 503);

  const { docs, drive } = await catalogo();
  const materias = [...new Set(docs.map((d) => d.materia))].sort();
  const porId = new Map(docs.map((d) => [d.id, d]));

  const mensajes: Anthropic.Beta.BetaMessageParam[] = hist.map((m) => ({ role: m.role, content: m.content }));
  // Tutor sobre un PDF abierto: se adjunta el archivo a la primera pregunta
  const abierto = body.archivo ? porId.get(body.archivo) : undefined;
  if (abierto) {
    mensajes.push({ role: "system" as never, content:
      `El alumno está mirando este archivo: "${abierto.titulo}" de ${abierto.materia} (profe: ${nombreProfe(abierto.profesor)}, ${abierto.anio ?? "sin fecha"}), id ${abierto.id}. Si la pregunta es sobre él, leelo con leer_archivo.` } as never);
  }

  let lecturas = 0;
  const hasta = Date.now() + TOPE_MS;
  async function bajarPdf(d: Doc): Promise<Pdf | null> {
    const r = await fetch(urlDoc(d));
    if (!r.ok) return null;
    return { pdf: encodeBase64(new Uint8Array(await r.arrayBuffer())),
      titulo: `${d.titulo} — ${d.materia} (${nombreProfe(d.profesor)}, ${d.anio ?? "sin fecha"})` };
  }
  async function ejecutar(nombre: string, input: Record<string, string>): Promise<string | Pdf> {
    if (nombre === "buscar_material") {
      const r = buscar(docs, input.consulta || "", input.materia, input.tipo);
      return JSON.stringify(r.length ? r : { resultado: "No hay archivos que coincidan." });
    }
    if (nombre === "carpetas_drive") {
      const k = Object.keys(drive).find((k) => norm(k) === norm(input.materia)) ||
        Object.keys(drive).find((k) => norm(k).includes(norm(input.materia)) || norm(input.materia).includes(norm(k)));
      return JSON.stringify({ materia: k || input.materia, carpetas: k ? drive[k] : [], drive_completo: drive["_raiz"] });
    }
    if (nombre === "leer_archivo") {
      const d = porId.get(input.id);
      if (!d) return "No existe un archivo con ese id. Buscalo primero con buscar_material.";
      if (lecturas >= MAX_LECTURAS) return `Ya leíste ${MAX_LECTURAS} archivos en esta consulta; respondé con lo que tenés.`;
      if (Date.now() > hasta - 45_000) return "No queda tiempo para leer más archivos; respondé con lo que tenés y pasale los links al alumno.";
      if (d.tamano > MAX_PDF) return "Ese archivo es muy pesado para leerlo acá; elegí otro más liviano o pasale el link al alumno.";
      lecturas++;
      return await bajarPdf(d) ?? "No se pudo descargar el archivo.";
    }
    return "Herramienta desconocida.";
  }

  async function conClaude(): Promise<Response> {
  try {
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const r = await anthropic!.beta.messages.create({
        model: MODELO,
        max_tokens: 8000,
        output_config: { effort: "medium" },
        system: [{ type: "text", text: sistema(materias), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: mensajes,
      } as never) as Anthropic.Beta.BetaMessage;

      if (r.stop_reason === "refusal") return resp({ respuesta: "No puedo ayudar con eso. Probá preguntando sobre alguna materia.", quedan });
      if (r.stop_reason !== "tool_use") {
        const texto = r.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("\n").trim();
        return resp({ respuesta: texto || "No encontré una respuesta. Probá reformulando.", quedan });
      }
      mensajes.push({ role: "assistant", content: r.content });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const b of r.content) {
        if (b.type !== "tool_use") continue;
        let content: Anthropic.Beta.BetaToolResultBlockParam["content"];
        let is_error = false;
        try {
          const out = await ejecutar(b.name, (b.input || {}) as Record<string, string>);
          content = typeof out === "string" ? out : [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: out.pdf }, title: out.titulo }] as never;
        }
        catch (e) { console.error(e); content = "Error al ejecutar la herramienta."; is_error = true; }
        resultados.push({ type: "tool_result", tool_use_id: b.id, content, is_error });
      }
      mensajes.push({ role: "user", content: resultados });
    }
    return resp({ respuesta: "La consulta quedó muy larga. Probá con una pregunta más concreta.", quedan });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.RateLimitError) return resp({ error: "La IA está saturada. Probá en un minuto." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return resp({ error: "La IA no está bien configurada." }, 503);
    return resp({ error: "Hubo un error con la IA. Probá de nuevo." }, 502);
  }
  }

  // ---------- Gemini (gratis con la clave de Google AI Studio, sin facturación activada) ----------
  async function conGemini(): Promise<Response> {
    const contents: any[] = hist.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const ultimo = contents[contents.length - 1];
    if (abierto) {
      const pdf = abierto.tamano <= MAX_PDF ? await bajarPdf(abierto) : null;
      ultimo.parts.unshift({ text: `[El alumno está mirando "${abierto.titulo}" de ${abierto.materia} (profe: ${nombreProfe(abierto.profesor)}, ${abierto.anio ?? "sin fecha"}), id ${abierto.id}. ${pdf ? "Va adjunto." : "Es muy pesado para leerlo acá: respondé en general y decile que lo mire en el visor."}]` });
      if (pdf) { lecturas++; ultimo.parts.push({ inlineData: { mimeType: "application/pdf", data: pdf.pdf } }); }
    }
    const tools = [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      // Si queda poco tiempo, se le pide que responda ya, sin usar más herramientas
      const apurado = Date.now() > hasta - 40_000 || vuelta === 5;
      const extra = apurado ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {};
      let r = await llamarGemini({ systemInstruction: { parts: [{ text: sistema(materias) }] }, contents, tools, ...extra,
        generationConfig: { maxOutputTokens: 6144 } }, hasta);
      if (r.status === 400 && contents.some((c) => c.parts.some((p: any) => p.functionResponse) && c.parts.some((p: any) => p.inlineData))) {
        // Algunos modelos no aceptan el PDF junto a la respuesta de la herramienta: se manda en un mensaje aparte
        for (let k = contents.length - 1; k >= 0; k--) {
          const c = contents[k];
          const inl = c.parts.filter((p: any) => p.inlineData);
          if (inl.length && c.parts.some((p: any) => p.functionResponse)) {
            c.parts = c.parts.filter((p: any) => !p.inlineData);
            contents.splice(k + 1, 0, { role: "user", parts: [{ text: "PDF pedido:" }, ...inl] });
          }
        }
        r = await llamarGemini({ systemInstruction: { parts: [{ text: sistema(materias) }] }, contents, tools, ...extra,
          generationConfig: { maxOutputTokens: 6144 } }, hasta);
      }
      if (r.status === 504) return resp({ error: "La IA tardó demasiado (la gratis a veces está lenta). Probá con una pregunta más concreta o de nuevo en un rato." }, 429);
      if (r.status === 429) return resp({ error: "La IA gratis llegó a su límite por ahora. Probá en un rato." }, 429);
      if (r.status === 503 || r.status === 500) return resp({ error: "La IA gratis de Google está saturada en este momento. Probá de nuevo en un minuto." }, 429);
      if (!r.ok) { console.error("Gemini", r.status, await r.text()); return resp({ error: "Hubo un error con la IA. Probá de nuevo." }, 502); }
      const j = await r.json();
      const cand = j.candidates?.[0];
      if (!cand?.content?.parts) {
        const motivo = j.promptFeedback?.blockReason || cand?.finishReason;
        return resp({ respuesta: motivo ? "No puedo ayudar con eso. Probá preguntando sobre alguna materia." : "No encontré una respuesta. Probá reformulando.", quedan });
      }
      const llamadas = cand.content.parts.filter((p: any) => p.functionCall);
      if (!llamadas.length) {
        const texto = cand.content.parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
        return resp({ respuesta: texto || "No encontré una respuesta. Probá reformulando.", quedan });
      }
      contents.push(cand.content); // se devuelve tal cual (incluye las firmas de razonamiento)
      const partes: any[] = [], adjuntos: any[] = [];
      for (const p of llamadas) {
        const { name, args, id } = p.functionCall;
        let out: string | Pdf;
        try { out = await ejecutar(name, args || {}); } catch (e) { console.error(e); out = "Error al ejecutar la herramienta."; }
        const response = typeof out === "string" ? { resultado: out } : { resultado: `PDF "${out.titulo}" adjunto en este mensaje.` };
        partes.push({ functionResponse: { ...(id ? { id } : {}), name, response } });
        if (typeof out !== "string") adjuntos.push({ inlineData: { mimeType: "application/pdf", data: out.pdf } });
      }
      contents.push({ role: "user", parts: [...partes, ...adjuntos] });
    }
    return resp({ respuesta: "La consulta quedó muy larga. Probá con una pregunta más concreta.", quedan });
  }

  if (!GEMINI_KEY) return await conClaude();
  try { return await conGemini(); }
  catch (e) { console.error(e); return resp({ error: "Hubo un error con la IA. Probá de nuevo." }, 502); }
});
