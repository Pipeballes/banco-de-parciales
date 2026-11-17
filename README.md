# 📚 Banco de Parciales

Parciales viejos y apuntes de clase, organizados por **materia → profesor**, gratis para ver y descargar en PDF.

## Cómo subir material

1. Entrá a la carpeta [`fotos/`](fotos/) del repo.
2. Creá (o elegí) la carpeta de la **materia** y adentro la del **profesor**.
3. Subí las fotos (botón **Add file → Upload files** en GitHub, o desde tu compu).

```
fotos/
  Análisis Matemático I/
    Pérez/
      Parcial 1 2023/          ← carpeta con varias fotos = 1 PDF de varias páginas
        01.jpg
        02.jpg
      Apuntes clase 3.jpg      ← foto suelta = PDF de 1 página
      Final 2022.pdf           ← los PDF se suben tal cual
    Gómez/
      ...
  Física I/
    ...
```

- Las fotos de una carpeta se unen **en orden alfabético** (usá `01.jpg`, `02.jpg`…).
- Si el nombre tiene *parcial*, *final* o *examen* → aparece como **Parcial**. Si tiene *apunte*, *clase* o *resumen* → **Apunte**.
- Se aceptan JPG, PNG, WEBP, HEIC (iPhone) y PDF. La rotación del celular se corrige sola.

Apenas subís algo, una GitHub Action convierte las fotos a PDF y actualiza la página (tarda 1–2 minutos).

## Publicar la página (una sola vez)

1. Subí este proyecto a un repo de GitHub.
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. En **Actions**, ejecutá "Convertir fotos y publicar" (o subí una foto).
4. La página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
5. En `docs/config.js` poné `githubRepo: "TU-USUARIO/NOMBRE-DEL-REPO"`.

## Activar likes y contador de descargas (opcional, gratis)

Sin esto la página funciona, pero los likes se guardan solo en el navegador de cada persona.

1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor** → pegá el contenido de [`supabase.sql`](supabase.sql) → **Run**.
3. **Project Settings → API**: copiá la *Project URL* y la clave *anon/publishable*.
4. Pegalas en `docs/config.js`.

## Probar en tu compu

```bash
pip install pillow pillow-heif
python3 scripts/build.py
python3 -m http.server -d docs 8000
```

y abrí http://localhost:8000
