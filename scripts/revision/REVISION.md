# Revisión automática de material nuevo

Instrucciones para la sesión de Claude que corre sola (tarea programada) y suma a la página el material
nuevo del Drive de la comunidad y de los envíos de "Subir parcial". Seguilas al pie de la letra.

## 1. Qué buscar

**Drive** (carpeta raíz pública `1SICu8_tJX4y3iqztf_geba6rw2M5jm36`):

```bash
cd scripts/revision
python3 bfs.py 1SICu8_tJX4y3iqztf_geba6rw2M5jm36 /tmp/rev/tree.tsv
awk -F'\t' '$1=="file"{print $2"\t"$3}' /tmp/rev/tree.tsv | sort > /tmp/rev/todos.tsv
# nuevos = ids que no están en drive_vistos.txt
awk -F'\t' 'NR==FNR{v[$1]=1;next} !($1 in v)' drive_vistos.txt /tmp/rev/todos.tsv > /tmp/rev/nuevos.tsv
```

Bajar un archivo: `https://drive.usercontent.google.com/download?id=ID&export=download&confirm=t`.
Para ver varios juntos: `TREE=/tmp/rev/tree.tsv python3 getset.py "<ruta de la carpeta>" /tmp/rev/x` (arma `sheet*.png`).

**Envíos de la página**: `GET https://aytjufgmgxjlnoagfpbc.supabase.co/functions/v1/revision` con el header
`x-clave: <clave>`. La clave se lee con la herramienta de SQL de Supabase:
`select clave from privado.revision limit 1;` (nunca la escribas en un archivo, commit ni mensaje).
Devuelve los envíos sin revisar con links firmados a sus archivos. Al terminar cada uno:
`POST .../functions/v1/revision` con `{"id": <id>, "revisado": true}` y el mismo header.

## 2. Qué NO se agrega

Videos, libros, programas/syllabus, diapositivas o apuntes oficiales de la cátedra (APU/PPT/ACT),
consignas oficiales de TP, código, CVs. Tampoco lo que ya está en la página: compará con
`fp.py` (texto en común ≥ 0.4, o páginas con distancia de hash ≤ 20) y mirando las carpetas de la materia.
Exámenes viejos (≤ 2018) sí se agregan.

## 3. Privacidad (lo más importante)

- **Nunca** publiques el nombre de quien rindió. Tapalo en negro, igual que legajo, LU, DNI, firmas,
  mails, teléfonos, fotos de perfil, usuarios/links de GitHub, rutas de usuario de Windows y las líneas
  "Descargado por…" de Studocu (`studocu.py`). Herramientas: `mk2.py` (rectángulos por coordenadas, sirve
  para escaneos y fotos) y `redbb.py` (PDF con texto).
- **Mirá cada página después de tapar** (convertí a PNG y abrila). Si queda algo legible, volvé a tapar.
- Borrá los metadatos de autor de todo PDF con `save.py`.
- Nunca pongas nombres de alumnos en títulos, commits ni mensajes. Los nombres de profesores sí
  (salen de los nombres de carpetas o archivos).
- Si algo no se lee bien, **no adivines nombres ni datos**: dejalo sin publicar y anotalo en el resumen final
  para que lo revise el dueño de la página.

## 4. Cómo ordenar

- Ruta: `parciales/<Materia>/<Profesor>/<Título (fecha)>.pdf`. Usá los nombres de materia y profe que ya
  existen en `parciales/` (mismas tildes). Profe desconocido → carpeta `Sin profesor` (se ve como "Otros").
- Materia que dan dos profes juntos → carpeta `Profe A + Profe B` (cada uno queda como profe aparte).
  Profe nuevo → agregalo a `profesores.yml` con `general:` vacío, la materia en `materias:` y `comentario:` vacío.
- Títulos como los existentes: `1er Parcial (2025)`, `2do Parcial - Tema B (15-06-2026)`,
  `Final (online) - Julio (2026)`, `Recuperatorio 1 (2024)`, `Resumen para el Final`, `Apunte - …`.
- Si el examen se hizo en pantalla, agregá `(online)` al título.
- La fecha sale del examen, de la carpeta o del nombre del archivo, **nunca** de la fecha de modificación.
  Sin fecha → sin año en el título (queda en "Sin fecha").
- Fotos de un mismo examen → un solo PDF, en orden.

## 5. Publicar

```bash
python3 scripts/build.py            # tiene que terminar con "Listo"
git add -A parciales profesores.yml scripts/revision/drive_vistos.txt
git commit -m "Nuevo material: ..."   # sin nombres de alumnos
git push origin main
```

Agregá a `drive_vistos.txt` (ordenado, sin duplicados) los ids de **todos** los archivos del Drive que
revisaste, los hayas agregado o descartado, **menos** los que dejaste pendientes para el dueño.
Guardá solo los ids, nunca nombres de archivos.

## 6. Resumen final

Terminá con un resumen corto en español: qué se agregó (materia, profe, título), qué se descartó y por qué,
y qué quedó pendiente para que lo revise el dueño (con link al archivo del Drive o id del envío).
Si no había nada nuevo, decilo en una línea.
