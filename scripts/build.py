#!/usr/bin/env python3
"""
Convierte las fotos de `fotos/` en PDFs y genera `docs/data.json` para la página.

Estructura esperada:

  fotos/
    <Materia>/
      <Profesor>/
        foto_suelta.jpg              -> un PDF de 1 página (foto_suelta.pdf)
        archivo_ya_en.pdf            -> se copia tal cual
        <Nombre del documento>/      -> TODAS las fotos de esta carpeta se unen
          01.jpg  02.jpg  03.jpg        en un solo PDF, en orden alfabético
                                        ("Nombre del documento.pdf")

Si el nombre del archivo o carpeta contiene "parcial", "final" o "examen" se
marca como Parcial; si contiene "apunte", "nota" o "clase", como Apunte.

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
SRC = ROOT / "fotos"
OUT = ROOT / "docs" / "archivos"
DATA = ROOT / "docs" / "data.json"

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tif", ".tiff"}
MAX_SIDE = 2200  # px: suficiente para leer bien y mantener los PDF livianos


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[\s_-]+", "-", text) or "archivo"


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


ORDINAL = re.compile(
    r"\b(?:(?P<num>[1-4])\s*(?:°|º|er|ero|ro|do|ndo|to)?|(?P<pal>primer|primero|segundo|tercer|tercero|cuarto))\b")
PALABRAS = {"primer": 1, "primero": 1, "segundo": 2, "tercer": 3, "tercero": 3, "cuarto": 4}


def numero(name: str) -> int | None:
    """Primer número de instancia (1–4) en el nombre: "Parcial 1", "1° parcial", "segundo recuperatorio"."""
    m = ORDINAL.search(name.lower())
    if not m:
        return None
    return int(m["num"]) if m["num"] else PALABRAS[m["pal"]]


def classify(name: str) -> tuple[str, int | None]:
    """Devuelve (tipo, número). Tipos: Parcial, Recuperatorio, Final, Apunte, Otro."""
    n = name.lower()
    if "recup" in n:
        return "Recuperatorio", numero(n)
    if "final" in n:
        return "Final", None
    if any(k in n for k in ("parcial", "examen", "quiz")):
        return "Parcial", numero(n)
    if any(k in n for k in ("apunte", "nota", "clase", "resumen", "teoria", "teoría", "resolucion", "resolución")):
        return "Apunte", None
    return "Otro", None


def guess_type(name: str) -> str:
    return classify(name)[0]


def load_image(path: Path) -> Image.Image:
    if path.suffix.lower() == ".heic":
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
        except ImportError:
            sys.exit(f"Para convertir {path.name} instala: pip install pillow-heif")
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)  # respeta la rotación del celular
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def images_to_pdf(images: list[Path], dest: Path) -> int:
    pages = [load_image(p) for p in images]
    dest.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(dest, "PDF", save_all=True, append_images=pages[1:],
                  resolution=150, quality=82)
    return len(pages)


def pdf_pages(path: Path) -> int | None:
    try:
        return len(re.findall(rb"/Type\s*/Page[^s]", path.read_bytes())) or None
    except OSError:
        return None


GENERIC = re.compile(r"^(img|image|dsc|pxl|photo|foto|screenshot|captura|whatsapp|wa\d|scan|cam)[\W_]*\d|^\d{6,}", re.I)
AVISOS: list[str] = []


def aviso(msg: str) -> None:
    AVISOS.append(msg)
    print(f"  ⚠ {msg}")


def git_date(paths: list[Path]) -> str | None:
    """Fecha del último commit que tocó estos archivos (la fecha real de subida)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", *map(str, paths)],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip()
        return out or None
    except (OSError, subprocess.SubprocessError):
        return None


def canonical(kind: str, names: list[str], where: str = "") -> dict[str, str]:
    """Unifica nombres que solo difieren en tildes, mayúsculas o espacios.
    Se queda con la versión que tiene tildes/mayúsculas (la "más prolija")."""
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
_SIN_PROFE_SLUGS = {"sin-profesor", "sin-profe", "profesor-desconocido", "desconocido", "no-se", "archivo"}


def sin_profe(folder: str) -> bool:
    """Carpetas que significan "no sé quién es el profe": "Sin profesor", "??", "Desconocido"…"""
    return folder.strip() in {"?", "??", "???"} or slug(folder) in _SIN_PROFE_SLUGS


def is_stale(dest: Path, sources: list[Path]) -> bool:
    if not dest.exists():
        return True
    newest = max(s.stat().st_mtime for s in sources)
    return newest > dest.stat().st_mtime


def main() -> None:
    if not SRC.exists():
        sys.exit("No existe la carpeta fotos/")

    docs = []
    expected: set[Path] = set()

    def visible(d: Path):
        return [p for p in d.iterdir() if not p.name.startswith(".")]

    for loose in visible(SRC):
        if loose.is_file() and loose.suffix.lower() in IMG_EXT | {".pdf"}:
            aviso(f'"{loose.name}" está suelto en fotos/. Movelo a fotos/<Materia>/<Profesor>/.')

    materias = sorted(p for p in SRC.iterdir() if p.is_dir())
    materia_name = canonical("Materia", [m.name for m in materias])

    for materia_dir in materias:
        profs = sorted(p for p in materia_dir.iterdir() if p.is_dir())
        prof_name = canonical("Profesor", [p.name for p in profs if not sin_profe(p.name)],
                              f" en {materia_name[materia_dir.name]}")
        # Grupos (nombre visible, carpeta para los PDF, archivos). Lo que no tiene profe va a "??".
        grupos = [(SIN_PROFE if sin_profe(pd.name) else prof_name[pd.name],
                   "sin-profesor" if sin_profe(pd.name) else slug(pd.name),
                   pd.name, visible(pd)) for pd in profs]
        sueltos = [f for f in visible(materia_dir) if f.is_file()]
        if sueltos:
            grupos.append((SIN_PROFE, "sin-profesor", "", sueltos))

        for prof_label, prof_slug, prof_folder, items in grupos:
            base = OUT / slug(materia_dir.name) / prof_slug
            for item in sorted(items, key=natural_key):
                if item.name.startswith("."):
                    continue
                where = "/".join(x for x in (materia_dir.name, prof_folder, item.name) if x)
                if item.is_dir():
                    imgs = sorted((f for f in item.iterdir()
                                   if f.suffix.lower() in IMG_EXT), key=natural_key)
                    if not imgs:
                        aviso(f'La carpeta "{where}" no tiene fotos.')
                        continue
                    if any(f.is_dir() for f in item.iterdir()):
                        aviso(f'"{where}" tiene subcarpetas: solo se usan las fotos de primer nivel.')
                    title, sources = item.name, imgs
                elif item.suffix.lower() in IMG_EXT:
                    title, sources = item.stem, [item]
                elif item.suffix.lower() == ".pdf":
                    title, sources = item.stem, [item]
                else:
                    aviso(f'"{where}" no es una foto ni un PDF; se ignora.')
                    continue

                if GENERIC.search(title):
                    aviso(f'"{where}" tiene un nombre genérico. Renombralo, por ej. '
                          f'"Parcial 1 2023" o "Apuntes clase 3", para que la gente lo encuentre.')
                elif guess_type(title) == "Otro":
                    aviso(f'"{where}": no dice si es parcial o apunte, se muestra como "Otro". '
                          f'Agregá "Parcial 1", "Recuperatorio 2", "Final" o "Apuntes" al nombre si querés.')
                elif guess_type(title) in ("Parcial", "Recuperatorio") and classify(title)[1] is None:
                    aviso(f'"{where}": no dice qué número de {guess_type(title).lower()} es '
                          f'(1 o 2). Agregalo al nombre, por ej. "{guess_type(title)} 1 …".')

                dest = base / f"{slug(title)}.pdf"
                expected.add(dest)
                if is_stale(dest, sources):
                    if sources[0].suffix.lower() == ".pdf":
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(sources[0], dest)
                    else:
                        n = images_to_pdf(sources, dest)
                        print(f"  ✓ {dest.relative_to(ROOT)}  ({n} pág.)")

                pages = pdf_pages(dest) if sources[0].suffix.lower() == ".pdf" else len(sources)
                rel = dest.relative_to(ROOT / "docs").as_posix()
                docs.append({
                    "id": slug(f"{materia_dir.name}-{prof_folder or 'sin-profesor'}-{title}"),
                    "titulo": title.replace("_", " "),
                    "materia": materia_name[materia_dir.name],
                    "profesor": prof_label,
                    "tipo": classify(title)[0],
                    "numero": classify(title)[1],
                    "paginas": pages,
                    "tamano": dest.stat().st_size,
                    "archivo": rel,
                    "fecha": git_date(sources) or datetime.fromtimestamp(
                        max(s.stat().st_mtime for s in sources), timezone.utc
                    ).strftime("%Y-%m-%d"),
                })

    # Borra PDFs cuyo origen ya no existe
    if OUT.exists():
        for old in OUT.rglob("*.pdf"):
            if old not in expected:
                old.unlink()
                print(f"  ✗ borrado {old.relative_to(ROOT)}")

    # Solo reescribe data.json si cambió algo (evita commits y conflictos inútiles)
    try:
        previo = json.loads(DATA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    if previo.get("documentos") != docs:
        DATA.write_text(json.dumps({
            "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "documentos": docs,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {len(docs)} documentos en docs/data.json")
    if AVISOS:
        print(f"{len(AVISOS)} aviso(s) sobre nombres — revisalos arriba.")

    # Resumen visible en la pestaña Actions de GitHub
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"## 📚 {len(docs)} documentos publicados\n\n")
            if AVISOS:
                f.write(f"### ⚠️ {len(AVISOS)} cosa(s) para revisar en los nombres\n\n")
                f.write("".join(f"- {a}\n" for a in AVISOS))
            else:
                f.write("✅ Todos los nombres están bien.\n\n")
            f.write("\n| Materia | Profesor | Documento | Tipo | Págs |\n|---|---|---|---|---|\n")
            for d in docs:
                f.write(f"| {d['materia']} | {d['profesor']} | {d['titulo']} | {d['tipo']} | {d['paginas'] or ''} |\n")


if __name__ == "__main__":
    main()
