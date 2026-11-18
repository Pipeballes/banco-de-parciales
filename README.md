<div align="center">

# 📚 Banco de Parciales

**Parciales viejos, resoluciones y apuntes de Ingeniería de la Universidad de Palermo (UP) — gratis, ordenados y en PDF.**

> 🎓 **Todo el material es de la Universidad de Palermo (UP), Facultad de Ingeniería.**

<br>

<a href="https://pipeballes.github.io/banco-de-parciales/">
  <img src="https://img.shields.io/badge/👉_ENTRÁ_A_LA_PÁGINA-pipeballes.github.io/banco--de--parciales-4f46e5?style=for-the-badge" alt="Entrá a la página" height="44">
</a>

<br><br>

### 🔗 [pipeballes.github.io/banco-de-parciales](https://pipeballes.github.io/banco-de-parciales/)

</div>

---

## 👋 Sobre mí

¡Hola! Soy **Felipe**, estudiante de **Ingeniería en la Universidad de Palermo**.

Armé este banco porque sé lo que cuesta conseguir parciales viejos para practicar antes de un examen. **Mi objetivo es ayudar a la mayor cantidad de gente que esté en Ingeniería**: que cualquiera pueda entrar, encontrar el parcial de su materia y de su profesor, y llegar mejor preparado.

Si te sirvió, dejale un ♥ en la página. Y si tenés parciales para sumar, ¡mandalos!

---

## 🎓 Qué vas a encontrar

- **Parciales, recuperatorios, finales y apuntes**, organizados por **materia → profesor**.
- Dentro de cada materia, todo separado **por año** y, adentro, en **1er / 2do Parcial, 1er / 2do Recuperatorio, Finales y Apuntes**, con la fecha de cada examen.
- **Vista previa** desde el celular o la compu, y **descarga en PDF** con un toque.
- **Buscador** por materia, profesor o tema, y **likes** para ver qué es lo que más le sirvió a la gente.
- **Subir parciales desde la página**: en la sección **📤 Subir parcial** cualquiera puede mandar fotos o PDFs (con materia, profesor y año si los sabe). Se revisan y se tapan los datos personales antes de publicarlos.
- **Sugerencias**: en **💡 Sugerencias** se puede proponer qué agregar, cambiar o sacar de la página.
- **Opiniones sobre profesores**: recomendados ✅, neutros ⚪ y no recomendados ❌, en general y por materia (un profe puede ser bueno en una materia y no en otra).

### 📖 Materias disponibles

<!-- MATERIAS:START -->
**179 documentos en 21 materias** (se actualiza solo cada vez que se publica).

| Materia | Documentos | Profesores |
|---|---:|---|
| Administración de Datos I | 5 | Laura Lazzati, María Blanco |
| Administración de Proyectos | 10 | Pablo Werner |
| Álgebra | 9 | Fabiana Daian, Juan la Cruz Valladares |
| Álgebra Lineal | 17 | ?? |
| Algoritmos I | 5 | ?? |
| Algoritmos II | 7 | ?? |
| Análisis de la Información y de la Decisión | 9 | ?? |
| Análisis de Sistemas | 16 | Javier Rabuch |
| Análisis Matemático I | 6 | Angela Pierina Lanza |
| Análisis Matemático II | 15 | Javier Francario |
| Análisis Matemático IIIa | 16 | ?? |
| Aprendizaje de Máquina | 6 | ?? |
| Aprendizaje por Refuerzo | 2 | ?? |
| Arquitectura de Computadoras | 38 | Fabio Bruschetti, Jorge Echevarria |
| Arquitectura Web | 4 | ?? |
| Auditoría de Sistemas | 3 | ?? |
| Derecho Aplicado a la Informática | 1 | Claudio Alberto Schifer |
| Estructura de Datos y Algoritmos | 3 | Fabiana Daian |
| Introducción a la Programación | 1 | Agustina Jurgiel |
| Sistemas Digitales I | 3 | Ignacio Ziccardi |
| Sistemas y Métodos | 3 | María Abeledo |
<!-- MATERIAS:END -->

> 🔒 **Privacidad:** en todos los exámenes se tapan el nombre, el legajo y la firma de quien lo rindió.

---

## 🤝 ¿Querés sumar tus parciales?

¡Genial! Cuantos más haya, más gente ayudamos.

1. Sacales foto con buena luz, que se lea bien la letra. Si podés, mandá la foto original del celular y no la de WhatsApp, que pierde calidad.
2. Decime **materia**, **profesor**, **fecha del examen** y si es **parcial, recuperatorio, final o apunte** (y qué número: 1er, 2do…).
3. Subilas en la sección [**📤 Subir parcial**](https://pipeballes.github.io/banco-de-parciales/#subir) de la página, abrí un [**Issue acá en GitHub**](https://github.com/Pipeballes/banco-de-parciales/issues/new) o mandámelas por mensaje.

> ⚠️ **No subas fotos con tu nombre a la vista.** Lo que se sube a GitHub queda en el historial aunque después se borre. Mandámelas y yo me encargo de taparlo antes de publicarlas.

---

<details>
<summary><b>🛠️ Cómo funciona por dentro (para el que mantiene el repo)</b></summary>

<br>

La página se arma sola a partir de la carpeta [`parciales/`](parciales/), donde **solo se guardan PDF**. Si se suben fotos, una GitHub Action las convierte a PDF, **borra las imágenes** y publica la página (tarda 1–2 minutos).

### Estructura de carpetas

```
parciales/
  Álgebra/                                       ← materia
    Juan la Cruz Valladares/                     ← profesor
      Parcial 1 - Tema A (16-09-2025).pdf        ← fecha del examen entre paréntesis
      Recuperatorio 2 (03-07-2025).pdf
      2024/                                      ← o una carpeta con el año
        Final.pdf
      Parcial 2 (10-06-2026)/                    ← carpeta con fotos → se unen en 1 PDF y se borran
        01.jpg
        02.jpg
    Sin profesor/                                ← profe desconocido → aparece como "??"
```

- **¿No sabés quién es el profe?** Poné la foto suelta dentro de la materia, o en una carpeta `Sin profesor/`. En la página aparece con profesor **??**.
- **La fecha va entre paréntesis** en el nombre: `(15-04-2026)`. De ahí sale el año para agrupar y la fecha que se muestra. Si no tiene fecha, aparece en **"Sin fecha"**.
- Las fotos de una carpeta se unen **en orden alfabético** (`01.jpg`, `02.jpg`…).
- La **sección** sale del nombre:
  - *Parcial 1*, *1er parcial*, *primer parcial* → **1er Parcial**
  - *Recuperatorio 2*, *2do recuperatorio* → **2do Recuperatorio**
  - *Final* → **Finales** · *Apuntes*, *clase*, *resumen* → **Apuntes**
- Se aceptan JPG, PNG, WEBP, HEIC (iPhone) y PDF. La rotación del celular se corrige sola.

### ¿Quedaron bien los nombres?

En la pestaña **Actions** → última ejecución de "Convertir fotos y publicar" aparece un resumen con todo lo publicado y una lista **⚠️ para revisar** si algo está raro: la misma materia o profesor escrito de dos formas ("Perez" / "Pérez"), fotos sueltas sin profesor, nombres genéricos (`IMG_2023…`), o parciales sin número.

### Opiniones sobre profesores

Se cargan en [`profesores.yml`](profesores.yml) (se puede editar desde GitHub con el lápiz ✏️). Opciones: `recomendado`, `neutro` o `no recomendado`:

```yaml
Nombre del Profe:
  general: recomendado          # opinión de siempre
  materias:
    Álgebra: no recomendado     # opinión distinta para esta materia
  comentario: Explica muy bien.  # opcional, siempre respetuoso
```

### Likes y descargas

Se guardan en Supabase (proyecto "Banco de Parciales UP"). Los datos de conexión están en [`docs/config.js`](docs/config.js); la clave es pública, está bien que esté ahí. La tabla y sus permisos están en [`supabase.sql`](supabase.sql).

### Probar en la compu

```bash
pip install pillow pillow-heif
python3 scripts/build.py
python3 -m http.server -d docs 8000
```

y abrí http://localhost:8000

### Archivos

| Archivo | Qué hace |
|---|---|
| `parciales/` | Los PDF (ya con los datos personales tapados) |
| `scripts/build.py` | Convierte fotos a PDF, detecta secciones y revisa nombres |
| `docs/` | La página web (los PDF y `data.json` se generan al publicar) |
| `.github/workflows/publicar.yml` | Publica la página automáticamente |
| `profesores.yml` | Opiniones sobre profesores |
| `supabase.sql` | Base de datos de likes y descargas |


### 📥 Ver lo que manda la gente

Los envíos de **📤 Subir parcial** y **💡 Sugerencias** quedan guardados en Supabase (nadie más los puede ver ni descargar):

- **Archivos:** Supabase → *Storage* → bucket `envios` → carpeta `pendientes/` (una subcarpeta por envío, con fecha).
- **Datos del envío** (materia, profesor, año, comentario): *Table Editor* → tabla `envios`. Cuando lo subas a la página, marcá `revisado`.
- **Sugerencias:** *Table Editor* → tabla `sugerencias` (marcá `leido`).

Antes de publicar un envío: tapar nombre, legajo y firma, y pasarlo a la carpeta `parciales/Materia/Profesor/`.

</details>

<div align="center">
<br>

Hecho con ❤️ para estudiantes de Ingeniería.

</div>
