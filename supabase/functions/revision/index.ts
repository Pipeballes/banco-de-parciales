// Edge Function "revision": la usa la sesión automática de revisión (scripts/revision/REVISION.md).
// GET  -> envíos de "Subir parcial" sin revisar, con links firmados (1 hora) a sus archivos.
// POST {"id": n, "revisado": true} -> marca un envío como revisado.
// Requiere la clave REVISION_KEY de Supabase en el header x-revision-key o como contraseña Basic (o x-clave igual a privado.revision).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const secreto = Deno.env.get("REVISION_KEY") || "";
  // La clave llega en x-revision-key, o como contraseña de "usuario y contraseña" (Authorization: Basic)
  let dada = req.headers.get("x-revision-key") || "";
  const auth = req.headers.get("authorization") || "";
  if (!dada && /^basic /i.test(auth)) {
    try { const t = atob(auth.slice(6).trim()); dada = t.slice(t.indexOf(":") + 1); } catch { /* formato inválido */ }
  }
  let ok = secreto.length >= 8 && dada === secreto;
  if (!ok && req.headers.get("x-clave")) {
    const { data, error } = await db.rpc("revision_ok", { p_clave: req.headers.get("x-clave") });
    if (error) { console.error(error); return json({ error: "No se pudo verificar la clave" }, 500); }
    ok = !!data;
  }
  if (!ok) return json({ error: "Clave incorrecta" }, 401);

  if (req.method === "GET") {
    const { data, error: e } = await db.from("envios").select("*").or("revisado.is.null,revisado.eq.false").order("creado");
    if (e) { console.error(e); return json({ error: "No se pudieron leer los envíos" }, 500); }
    const envios = [];
    for (const env of data || []) {
      const archivos = [];
      for (const ruta of env.archivos || []) {
        const { data: s } = await db.storage.from("envios").createSignedUrl(ruta, 3600);
        archivos.push({ ruta, url: s?.signedUrl || null });
      }
      envios.push({ ...env, archivos });
    }
    return json({ envios });
  }

  if (req.method === "POST") {
    let body: { id?: number; revisado?: boolean };
    try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (typeof body.id !== "number") return json({ error: "Falta id" }, 400);
    const { error: e } = await db.from("envios").update({ revisado: body.revisado !== false }).eq("id", body.id);
    if (e) { console.error(e); return json({ error: "No se pudo actualizar" }, 500); }
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
});
