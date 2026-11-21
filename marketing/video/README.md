# Video publicitario de platin

Video vertical (1080×1920, 30 fps) hecho con [Remotion](https://www.remotion.dev): React que se renderiza a MP4. Concepto: **"El mes que viene"**.

- `Platin30`: 30 segundos, el guion completo.
- `Platin15`: 15 segundos (gancho, tarjeta en cuotas y cierre), con las mismas escenas.

El cierre usa la carita del guiño sola, el signo pesos con ojos en ink (`docs/brand/glifo-guino.svg`), y pestañea una vez con los mismos keyframes que `pl-wink` de `libs/web-ui` (`src/components/WinkLogo.tsx`; el momento se cambia con `WINK_AT` en `src/scenes/Closing.tsx`).

Es un proyecto aparte, fuera del workspace de Nx. Tiene su propio `package.json` y `pnpm-lock.yaml`.

## Requisitos

```bash
cd marketing/video
pnpm install
pnpm exec playwright install chromium   # solo para regenerar las capturas
```

La primera vez que renderiza, Remotion descarga su propio Chrome Headless Shell. Trae ffmpeg incluido, así que no hace falta instalarlo.

## Previsualizar

```bash
pnpm studio
```

Abre Remotion Studio en el navegador. Ahí elegís `Platin30` o `Platin15` y recorrés el video cuadro a cuadro.

## Renderizar

```bash
pnpm render:30   # out/platin-30s.mp4
pnpm render:15   # out/platin-15s.mp4
pnpm still       # out/portada.png (frame 85 del gancho, para miniatura)
pnpm render      # los tres
```

Para sacar un frame suelto y revisarlo:

```bash
pnpm exec remotion still src/index.ts Platin30 out/frames/f420.png --frame=420 --scale=0.5
```

`out/` no se versiona.

## Las pantallas de la app

Las capturas de `public/captures/` son de la app real, con datos ficticios. Se versionan, así que podés renderizar sin levantar la app. Para regenerarlas, por ejemplo después de un cambio de diseño:

1. Levantá la app en local desde la raíz del repo: `docker compose up -d`, la API en el puerto 3000 y la web en el 4200 (ver el README principal).
2. Cargá los datos de prueba:
   ```bash
   pnpm seed      # crea o reinicia demo@platin.test con datos creíbles
   ```
   Carga lo siguiente:
   - el sueldo;
   - Banco Galicia en pesos y en dólares, y Mercado Pago;
   - una Visa con "Super $ 48.320", "Zapatillas" en 6 cuotas, cena, heladera y celular en cuotas, y un vuelo en dólares;
   - el fijo de streaming;
   - la meta "Viaje" al 60 %.

   Solo corre contra `localhost` y usa la API pública.
3. Capturá:
   ```bash
   pnpm capture
   ```
   Playwright entra con el usuario de prueba en un viewport de 390×844 con deviceScaleFactor 3. Guarda inicio, tarjeta (pestaña Cuotas), compromisos, metas e inicio con "ocultar montos". Por cada pantalla genera dos imágenes:
   - `<pantalla>.png`: la página completa sin los elementos fijos, para que el video pueda hacer scroll.
   - `<pantalla>-viewport.png`: lo que se ve en el celular, con la barra inferior.

   También escribe `meta.json` con la posición de lo que el video anima encima: el número principal del inicio y las barras de "Cuotas por resumen". Si cambia el diseño, las animaciones se acomodan solas.

Las fechas salen del día en que corrés el seed. Si lo corrés otro mes, revisá en `src/config.ts` el mes de la escena del desborde (`overflow.month`) y los montos de los tickets.

## Dónde cambiar cada cosa

| Qué | Dónde |
|---|---|
| Textos en pantalla, URL del cierre, montos de los tickets | `src/config.ts` |
| Colores, tipografías, márgenes seguros, springs, tamaño del celular | `src/theme.ts` |
| Duración de cada escena y qué escenas entran en cada versión | `src/timeline.ts` |
| Escenas | `src/scenes/` |
| Usuario de prueba | `scripts/demo-user.mjs` |

En los textos de `config.ts`, las palabras entre `*asteriscos*` se resaltan. Un espacio duro (U+00A0) mantiene dos palabras en la misma línea.

## Audio (opcional)

Poné los archivos en `public/`:

- `public/voiceover.mp3`: la voz en off.
- `public/music.mp3`: la música. Entra y sale con un fundido, y baja de volumen si hay voz en off.

Si no están, el video se renderiza igual, en silencio. Los volúmenes se ajustan en `CONFIG.audio` (`src/config.ts`).

## Márgenes seguros

Todo el texto importante queda fuera de los 250 px de arriba y de abajo, y deja 130 px a la derecha para los botones de Reels y Shorts (`SAFE` en `src/theme.ts`). Lo único que entra en la franja de abajo es la barra de navegación del celular.

## Licencia de Remotion

Remotion es gratis para personas y para empresas de hasta 3 empleados. Las más grandes necesitan una [licencia de empresa](https://www.remotion.dev/license).
