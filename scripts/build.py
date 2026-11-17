#!/usr/bin/env python3
"""
Arma la página a partir de la carpeta `parciales/`.

En el repo solo se guardan PDF. Si alguien sube fotos, este script las convierte
a PDF en el mismo lugar y borra las imágenes.

Estructura:

  parciales/
    <Materia>/
      <Profesor>/                         ("Sin profesor/" o archivos sueltos en la materia → "??")
        Parcial 1 (15-04-2026).pdf        ← la fecha entre paréntesis da el año y la fecha del examen
        Recuperatorio 2 - 2025.pdf        ← o solo el año
        2024/                             ← o una carpeta con el año
          Final.pdf
        Parcial 2 (10-06-2026)/           ← carpeta con fotos → se unen en un PDF y se borran
          01.jpg  02.jpg

Uso:  python3 scripts/build.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "parciales"
OUT = ROOT / "docs" / "archivos"      # se genera en cada build (no se guarda en git)
DATA = ROOT / "docs" / "data.json"    # idem
PROFES = ROOT / "profesores.yml"      # opiniones sobre profesores (lo edita una persona)

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tif", ".tiff"}
MAX_SIDE = 2200  # px: se lee bien y los PDF quedan livianos

AVISOS: list[str] = []


def aviso(msg: str) -> None:
    AVISOS.append(msg)
    print(f"  ⚠ {msg}")


# ---------------------------------------------------------------- utilidades
def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[\s_-]+", "-", text) or "archivo"


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def visible(d: Path) -> list[Path]:
    return sorted((p for p in d.iterdir() if not p.name.startswith(".")), key=natural_key)


def git_date(path: Path) -> str | None:
    """Fecha del último commit que tocó el archivo (fecha de subida)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip()
        return out or None
    except (OSError, subprocess.SubprocessError):
        return None


def pdf_pages(path: Path) -> int | None:
    try:
        return len(re.findall(rb"/Type\s*/Page[^s]", path.read_bytes())) or None
    except OSError:
        return None


# ---------------------------------------------------------------- fotos → PDF
def load_image(path: Path) -> Image.Image:
    if path.suffix.lower() == ".heic":
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
        except ImportError:
            sys.exit(f"Para convertir {path.name} instalá: pip install pillow-heif")
    img = ImageOps.exif_transpose(Image.open(path))  # respeta la rotación del celular
    img = img.convert("RGB")                         # y descarta los metadatos (EXIF, GPS)
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def images_to_pdf(images: list[Path], dest: Path) -> None:
    pages = [load_image(p) for p in images]
    pages[0].save(dest, "PDF", save_all=True, append_images=pages[1:], resolution=150, quality=85)


def free_path(dest: Path) -> Path:
    n = 2
    while dest.exists():
        dest = dest.with_name(f"{dest.stem} ({n}){dest.suffix}")
        n += 1
    return dest


def convert_in_place(item: Path) -> Path | None:
    """Convierte una foto suelta o una carpeta de fotos a PDF, borra las imágenes y
    devuelve la ruta del PDF."""
    rel = item.relative_to(SRC)
    if item.is_dir():
        imgs = [f for f in visible(item) if f.suffix.lower() in IMG_EXT]
        if not imgs:
            aviso(f'La carpeta "{rel}" no tiene fotos ni PDF.')
            return None
        dest = free_path(item.with_name(item.name + ".pdf"))
        images_to_pdf(imgs, dest)
        for f in imgs:
            f.unlink()
        if any(item.iterdir()):
            aviso(f'"{rel}" tenía archivos que no son fotos; quedaron en la carpeta.')
        else:
            item.rmdir()
        print(f"  ✓ fotos → {dest.relative_to(ROOT)}  ({len(imgs)} pág.)")
        return dest
    dest = free_path(item.with_suffix(".pdf"))
    images_to_pdf([item], dest)
    item.unlink()
    print(f"  ✓ foto → {dest.relative_to(ROOT)}")
    return dest


# ---------------------------------------------------------------- nombres
DATE_RE = re.compile(
    r"\(?\s*(?<!\d)(?P<d>[0-3]?\d)[-/._](?P<m>[01]?\d)(?:[-/._](?P<y>(?:19|20)?\d\d))?(?!\d)\s*\)?")
YEAR_RE = re.compile(r"(?<!\d)(?P<y>(?:19[89]|20\d)\d)(?!\d)")
ORDINAL = re.compile(
    r"\b(?:(?P<num>[1-4])\s*(?:°|º|er|ero|ro|do|ndo|to)?|(?P<pal>primer|primero|segundo|tercer|tercero|cuarto))\b")
PALABRAS = {"primer": 1, "primero": 1, "segundo": 2, "tercer": 3, "tercero": 3, "cuarto": 4}
GENERIC = re.compile(r"^(img|image|dsc|pxl|photo|foto|screenshot|captura|whatsapp|wa\d|scan|cam)[\W_]*\d|^\d{6,}", re.I)


def parse_name(stem: str) -> tuple[str, int | None, str | None]:
    """'Parcial 1 (15-04-2026)' → ('Parcial 1', 2026, '2026-04-15').
    Devuelve (título limpio, año, fecha del examen: 'AAAA-MM-DD' o 'MM-DD' si no hay año)."""
    title, year, fecha = stem, None, None
    for m in DATE_RE.finditer(stem):
        d, mo = int(m["d"]), int(m["m"])
        # Solo cuenta como fecha si está entre paréntesis o trae año (evita "Parcial 1-2")
        if not (1 <= d <= 31 and 1 <= mo <= 12) or not (m["y"] or "(" in m.group(0)):
            continue
        if m["y"]:
            year = int(m["y"]) + (2000 if len(m["y"]) == 2 else 0)
            fecha = f"{year:04d}-{mo:02d}-{d:02d}"
        else:
            fecha = f"{mo:02d}-{d:02d}"
        title = title.replace(m.group(0), " ")
        break
    if year is None and (m := YEAR_RE.search(title)):
        year = int(m["y"])
    if year is not None:
        title = YEAR_RE.sub(" ", title)
    title = re.sub(r"\(\s*\)", " ", title).replace("_", " ")
    title = re.sub(r"\s*[-–]\s*(?=[-–]|$)", "", re.sub(r"\s+", " ", title)).strip(" -–,")
    title = re.sub(r"\s+-\s+-\s+", " - ", title)
    return title or stem, year, fecha


def numero(name: str) -> int | None:
    # "Tema 2" o "Modelo B" no dicen qué parcial es: no los cuento como número
    m = ORDINAL.search(re.sub(r"\b(tema|modelo|versi[oó]n)\s+\S+", " ", name.lower()))
    if not m:
        return None
    return int(m["num"]) if m["num"] else PALABRAS[m["pal"]]


def classify(name: str) -> tuple[str, int | None]:
    """(tipo, número). Tipos: Parcial, Recuperatorio, Final, Apunte, Otro."""
    n = name.lower()
    # Material de estudio, aunque el nombre mencione un parcial ("Banco de preguntas - 2do parcial")
    if any(k in n for k in ("banco de preguntas", "apunte", "resumen")):
        return "Apunte", None
    if "recup" in n:
        return "Recuperatorio", numero(n)
    if "final" in n:
        return "Final", None
    if any(k in n for k in ("parcial", "examen", "quiz")):
        return "Parcial", numero(n)
    if any(k in n for k in ("apunte", "nota", "clase", "resumen", "teoria", "teoría", "resolucion", "resolución")):
        return "Apunte", None
    return "Otro", None


def canonical(kind: str, names: list[str], where: str = "") -> dict[str, str]:
    """Unifica nombres que solo difieren en tildes/mayúsculas ("Perez" = "Pérez")."""
    groups: dict[str, list[str]] = {}
    for n in names:
        groups.setdefault(slug(n), []).append(n)
    mapping = {}
    for variants in groups.values():
        best = max(variants, key=lambda v: (sum(ord(c) > 127 for c in v), sum(c.isupper() for c in v)))
        for v in variants:
            mapping[v] = best
        if len(variants) > 1:
            otros = ", ".join(f'"{v}"' for v in variants if v != best)
            aviso(f'{kind} con nombre casi igual{where}: {otros} se unificó con "{best}". '
                  f"Conviene renombrar la carpeta para que quede prolijo.")
    return mapping


SIN_PROFE = "??"


def sin_profe(folder: str) -> bool:
    return folder.strip() in {"?", "??", "???"} or slug(folder) in {
        "sin-profesor", "sin-profe", "profesor-desconocido", "desconocido", "no-se", "archivo"}


def is_year_folder(p: Path) -> bool:
    return p.is_dir() and re.fullmatch(r"(19[89]|20\d)\d", p.name) is not None


def expand(items: list[Path], year: int | None = None):
    """Recorre los archivos de un profe, entrando en carpetas de año (2025/, 2026/…)."""
    for item in items:
        if is_year_folder(item):
            yield from expand(visible(item), int(item.name))
        else:
            yield item, year


# ---------------------------------------------------------------- opiniones sobre profes
OPINIONES = {
    "recomendado": "recomendado", "recomendada": "recomendado", "si": "recomendado", "sí": "recomendado",
    "bueno": "recomendado", "buena": "recomendado", "👍": "recomendado", "✅": "recomendado",
    "neutro": "neutro", "neutra": "neutro", "regular": "neutro", "normal": "neutro", "meh": "neutro",
    "no recomendado": "no recomendado", "no recomendada": "no recomendado", "no": "no recomendado",
    "malo": "no recomendado", "mala": "no recomendado", "👎": "no recomendado", "❌": "no recomendado",
}


def opinion(value, where: str) -> str | None:
    if isinstance(value, bool):  # YAML lee "no"/"sí" como falso/verdadero
        return "recomendado" if value else "no recomendado"
    if value is None or str(value).strip() == "":
        return None
    key = str(value).strip().lower()
    if key in OPINIONES:
        return OPINIONES[key]
    aviso(f'profesores.yml: "{value}" ({where}) no se entiende. Usá: recomendado, neutro o no recomendado.')
    return None


def load_profes(docs: list[dict]) -> list[dict]:
    """Junta las opiniones de profesores.yml con los profes que aparecen en los parciales."""
    raw = {}
    if PROFES.exists():
        try:
            import yaml  # type: ignore
            raw = yaml.safe_load(PROFES.read_text(encoding="utf-8")) or {}
        except Exception as e:  # noqa: BLE001
            aviso(f"profesores.yml tiene un error de formato y no se pudo leer: {e}")
            raw = {}
        if not isinstance(raw, dict):
            aviso("profesores.yml tiene que ser una lista de profes con sus opiniones.")
            raw = {}

    dicta: dict[str, set[str]] = {}
    nombres: dict[str, str] = {}
    materias_slug = {}
    for d in docs:
        if d["profesor"] == SIN_PROFE:
            continue
        nombres.setdefault(slug(d["profesor"]), d["profesor"])
        dicta.setdefault(slug(d["profesor"]), set()).add(d["materia"])
        materias_slug[slug(d["materia"])] = d["materia"]

    profes: dict[str, dict] = {}
    for nombre, info in raw.items():
        info = info if isinstance(info, dict) else {"general": info}
        k = slug(str(nombre))
        mats = {}
        for mat, val in (info.get("materias") or {}).items():
            mat_name = materias_slug.get(slug(str(mat)), str(mat))
            dicta.setdefault(k, set()).add(mat_name)   # la dicta aunque no haya opinión todavía
            op = opinion(val, f"{nombre} / {mat}")
            if op:
                mats[mat_name] = op
        profes[k] = {
            "nombre": nombres.get(k, str(nombre)),
            "general": opinion(info.get("general"), str(nombre)),
            "materias": mats,
            "comentario": str(info.get("comentario") or "").strip(),
        }
    for k, nombre in nombres.items():
        profes.setdefault(k, {"nombre": nombre, "general": None, "materias": {}, "comentario": ""})
    for k, p in profes.items():
        p["dicta"] = sorted(dicta.get(k, set()) | set(p["materias"]), key=str.lower)
    return sorted(profes.values(), key=lambda p: p["nombre"].lower())


# ---------------------------------------------------------------- principal
def main() -> None:
    if not SRC.exists():
        sys.exit("No existe la carpeta parciales/")

    for loose in visible(SRC):
        if loose.is_file() and loose.suffix.lower() != ".md":
            aviso(f'"{loose.name}" está suelto en parciales/. Movelo a parciales/<Materia>/<Profesor>/.')

    if OUT.exists():
        shutil.rmtree(OUT)
    docs = []
    materias = [p for p in visible(SRC) if p.is_dir()]
    materia_name = canonical("Materia", [m.name for m in materias])

    for materia_dir in materias:
        mname = materia_name[materia_dir.name]
        profs = [p for p in visible(materia_dir) if p.is_dir() and not is_year_folder(p)]
        prof_name = canonical("Profesor", [p.name for p in profs if not sin_profe(p.name)], f" en {mname}")
        grupos = [(SIN_PROFE if sin_profe(p.name) else prof_name[p.name],
                   "sin-profesor" if sin_profe(p.name) else slug(p.name), visible(p)) for p in profs]
        sueltos = [f for f in visible(materia_dir) if f.is_file() or is_year_folder(f)]
        if sueltos:
            grupos.append((SIN_PROFE, "sin-profesor", sueltos))

        for prof_label, prof_slug, items in grupos:
            for item, folder_year in expand(items):
                rel = item.relative_to(SRC)
                if item.is_dir() or item.suffix.lower() in IMG_EXT:
                    pdf = convert_in_place(item)
                    if pdf is None:
                        continue
                elif item.suffix.lower() == ".pdf":
                    pdf = item
                else:
                    aviso(f'"{rel}" no es PDF ni foto; se ignora.')
                    continue

                rel = pdf.relative_to(SRC)
                titulo, anio, fecha = parse_name(pdf.stem)
                anio = anio or folder_year
                tipo, num = classify(titulo)

                if GENERIC.search(pdf.stem):
                    aviso(f'"{rel}" tiene un nombre genérico. Renombralo, por ej. "Parcial 1 (15-04-2026)".')
                elif tipo == "Otro":
                    aviso(f'"{rel}": no dice si es parcial, recuperatorio, final o apunte; se muestra como "Otro".')
                elif tipo in ("Parcial", "Recuperatorio") and num is None:
                    aviso(f'"{rel}": no dice qué número de {tipo.lower()} es. Por ej. "{tipo} 1 …".')
                if anio is None and tipo != "Apunte":
                    aviso(f'"{rel}" no tiene año: aparece en "Sin fecha". '
                          f'Agregá la fecha al nombre, por ej. "{titulo} (15-04-2026)".')

                name = "-".join(x for x in (str(anio or ""), slug(pdf.stem)) if x)
                dest = OUT / slug(materia_dir.name) / prof_slug / f"{name}.pdf"
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(pdf, dest)

                docs.append({
                    "id": slug(f"{materia_dir.name}-{prof_slug}-{rel.as_posix()}"),
                    "titulo": titulo,
                    "materia": mname,
                    "profesor": prof_label,
                    "tipo": tipo,
                    "numero": num,
                    "anio": anio,
                    "fecha_examen": fecha,
                    "paginas": pdf_pages(pdf),
                    "tamano": pdf.stat().st_size,
                    "archivo": dest.relative_to(ROOT / "docs").as_posix(),
                    "subido": git_date(pdf) or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                })

    profes = load_profes(docs)
    try:
        previo = json.loads(DATA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    if previo.get("documentos") != docs or previo.get("profesores") != profes:
        DATA.write_text(json.dumps({
            "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "documentos": docs,
            "profesores": profes,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Listo: {len(docs)} documentos")
    if AVISOS:
        print(f"{len(AVISOS)} aviso(s) — revisalos arriba.")

    # Resumen visible en la pestaña Actions de GitHub
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"## 📚 {len(docs)} documentos publicados\n\n")
            if AVISOS:
                f.write(f"### ⚠️ {len(AVISOS)} cosa(s) para revisar\n\n" + "".join(f"- {a}\n" for a in AVISOS))
            else:
                f.write("✅ Todos los nombres están bien.\n")
            f.write("\n| Materia | Año | Profesor | Documento | Tipo | Págs |\n|---|---|---|---|---|---|\n")
            for d in sorted(docs, key=lambda d: (d["materia"], -(d["anio"] or 0), d["titulo"])):
                f.write(f"| {d['materia']} | {d['anio'] or '—'} | {d['profesor']} | {d['titulo']} "
                        f"| {d['tipo']} | {d['paginas'] or ''} |\n")


if __name__ == "__main__":
    main()
