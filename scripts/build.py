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
import re
import shutil
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


def guess_type(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("parcial", "final", "examen", "quiz", "recuperatorio")):
        return "Parcial"
    if any(k in n for k in ("apunte", "nota", "clase", "resumen", "teoria", "teoría")):
        return "Apunte"
    return "Otro"


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

    for materia_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        for prof_dir in sorted(p for p in materia_dir.iterdir() if p.is_dir()):
            base = OUT / slug(materia_dir.name) / slug(prof_dir.name)
            for item in sorted(prof_dir.iterdir(), key=natural_key):
                if item.name.startswith("."):
                    continue
                if item.is_dir():
                    imgs = sorted((f for f in item.iterdir()
                                   if f.suffix.lower() in IMG_EXT), key=natural_key)
                    if not imgs:
                        continue
                    title, sources = item.name, imgs
                elif item.suffix.lower() in IMG_EXT:
                    title, sources = item.stem, [item]
                elif item.suffix.lower() == ".pdf":
                    title, sources = item.stem, [item]
                else:
                    continue

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
                    "id": slug(f"{materia_dir.name}-{prof_dir.name}-{title}"),
                    "titulo": title.replace("_", " "),
                    "materia": materia_dir.name,
                    "profesor": prof_dir.name,
                    "tipo": guess_type(title),
                    "paginas": pages,
                    "tamano": dest.stat().st_size,
                    "archivo": rel,
                    "fecha": datetime.fromtimestamp(
                        max(s.stat().st_mtime for s in sources), timezone.utc
                    ).strftime("%Y-%m-%d"),
                })

    # Borra PDFs cuyo origen ya no existe
    if OUT.exists():
        for old in OUT.rglob("*.pdf"):
            if old not in expected:
                old.unlink()
                print(f"  ✗ borrado {old.relative_to(ROOT)}")

    DATA.write_text(json.dumps({
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documentos": docs,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Listo: {len(docs)} documentos en docs/data.json")


if __name__ == "__main__":
    main()
