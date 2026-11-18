-- Pegá esto en Supabase → SQL Editor → Run.
-- Crea un contador de likes y descargas por documento que cualquiera puede
-- leer y sumar (pero no borrar ni editar a mano).

create table if not exists public.stats (
  doc_id     text primary key,
  likes      integer not null default 0 check (likes >= 0),
  descargas  integer not null default 0 check (descargas >= 0)
);

alter table public.stats enable row level security;

drop policy if exists "leer stats" on public.stats;
create policy "leer stats" on public.stats for select using (true);

-- Única forma de modificar: esta función, que solo suma o resta 1.
create or replace function public.sumar(p_doc text, p_campo text, p_delta int)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare nuevo integer;
begin
  if p_delta not in (-1, 1) or length(p_doc) > 200 then
    raise exception 'valor no permitido';
  end if;

  if p_campo = 'likes' then
    insert into stats (doc_id, likes) values (p_doc, greatest(p_delta, 0))
    on conflict (doc_id) do update set likes = greatest(stats.likes + p_delta, 0)
    returning likes into nuevo;
  elsif p_campo = 'descargas' and p_delta = 1 then
    insert into stats (doc_id, descargas) values (p_doc, 1)
    on conflict (doc_id) do update set descargas = stats.descargas + 1
    returning descargas into nuevo;
  else
    raise exception 'campo no permitido';
  end if;

  return nuevo;
end;
$$;

revoke all on function public.sumar(text, text, int) from public;
grant execute on function public.sumar(text, text, int) to anon, authenticated;

-- Envíos de parciales y sugerencias desde la página (solo insertar; nadie puede leer con la clave pública)
create table if not exists public.envios (
  id bigint generated always as identity primary key, creado timestamptz not null default now(),
  materia text not null check (char_length(materia) between 1 and 120), profesor text check (char_length(profesor) <= 120),
  anio text check (char_length(anio) <= 20), tipo text check (char_length(tipo) <= 40), comentario text check (char_length(comentario) <= 1000),
  archivos text[] not null check (cardinality(archivos) between 1 and 20), revisado boolean not null default false);
alter table public.envios enable row level security;
create policy "cualquiera puede enviar" on public.envios for insert to anon, authenticated with check (revisado = false);
create table if not exists public.sugerencias (
  id bigint generated always as identity primary key, creado timestamptz not null default now(),
  tipo text check (tipo in ('agregar','cambiar','sacar','otro')), texto text not null check (char_length(texto) between 3 and 2000),
  leido boolean not null default false);
alter table public.sugerencias enable row level security;
create policy "cualquiera puede sugerir" on public.sugerencias for insert to anon, authenticated with check (leido = false);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('envios', 'envios', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;
create policy "cualquiera puede subir a envios" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'envios' and (storage.foldername(name))[1] = 'pendientes');
