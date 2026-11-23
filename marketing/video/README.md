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
pnpm render:30              # out/platin-30s.mp4: voz, efectos y música
pnpm render:30:sin-musica   # out/platin-30s-sin-musica.mp4: voz y efectos
pnpm render:15              # out/platin-15s.mp4
pnpm render:15:sin-musica   # out/platin-15s-sin-musica.mp4
pnpm still                  # out/portada.png (frame 85 del gancho, para miniatura)
pnpm render                 # todo lo anterior
```

La versión sin música sirve para Reels y TikTok, donde el audio en tendencia se elige al publicar.

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
| Textos en pantalla, URL del cierre, montos de los tickets, frases de la voz | `src/config.ts` |
| Colores, tipografías, márgenes seguros, springs, tamaño del celular | `src/theme.ts` |
| Duración de cada escena y qué escenas entran en cada versión | `src/timeline.ts` |
| Escenas | `src/scenes/` |
| Usuario de prueba | `scripts/demo-user.mjs` |

En los textos de `config.ts`, las palabras entre `*asteriscos*` se resaltan. Un espacio duro (U+00A0) mantiene dos palabras en la misma línea.

## Audio

Las tres capas son opcionales: si falta un archivo, el video se renderiza igual sin esa capa. Los volúmenes están en `CONFIG.audio` (`src/config.ts`).

### Voz en off (ElevenLabs)

Cada frase es un MP3 aparte (`public/voice/30-01.mp3`, `15-02.mp3`…), y el video la ubica en el frame de su escena. Si cambia la duración de una escena, la voz la sigue sola.

1. Copiá `.env.example` a `.env` y completá:
   - `ELEVENLABS_API_KEY`: en elevenlabs.io, *Developers › API Keys*, con permiso de Text to Speech.
   - `ELEVENLABS_VOICE_ID`: en *Voices*, elegí una voz y usá *Copy voice ID*. Conviene una voz de español rioplatense; en la *Voice Library* podés filtrar por acento argentino.

   `.env` no se versiona.
2. Generá la voz:
   ```bash
   pnpm voiceover               # las frases de las dos versiones
   pnpm voiceover --cut 15      # solo la de 15 s
   pnpm voiceover --force       # rehace todo, aunque nada haya cambiado
   ```
   Solo vuelve a pedir a ElevenLabs las frases que cambiaron (texto, voz, modelo o ajustes), así no gastás créditos de más. Al final muestra cuánto dura cada frase y cuánto lugar tiene. Si una no entra (`!!`), acortá el texto, subí `ELEVENLABS_SPEED` (hasta 1,2) o mové su `at`.
3. Escuchala en `pnpm studio` y renderizá.

Las frases y el momento de cada una (`scene` + `at`, en frames desde que empieza la escena) están en `CONFIG.voice` (`src/config.ts`). En `.env` podés ajustar el modelo, la estabilidad, el estilo y la velocidad. Si la voz pronuncia mal "platin", probá escribirlo como suena (por ejemplo "pláatin") solo en el texto de la voz.

### Música

`public/music.mp3`. Entra y sale con un fundido, y queda por debajo de la voz. Fuentes libres de derechos: YouTube Audio Library o Pixabay Music (gratis), Artlist o Epidemic Sound (pagas). Buscá algo calmo, de 90 a 110 BPM. Revisá la licencia antes de usarla en anuncios pagos.

### Efectos de sonido

`pnpm sfx` los sintetiza en `public/sfx/`, sin descargas ni licencias:
- `tick`: cae un ticket;
- `whoosh`: las transiciones a verde y a blanco;
- `pop`: cada cuota llega a su mes, y el guiño;
- `click`: el interruptor de ocultar montos.

Podés reemplazar cualquiera por otro WAV con el mismo nombre. `sfxVolume: 0` los apaga a todos.

## Márgenes seguros

Todo el texto importante queda fuera de los 250 px de arriba y de abajo, y deja 130 px a la derecha para los botones de Reels y Shorts (`SAFE` en `src/theme.ts`). Lo único que entra en la franja de abajo es la barra de navegación del celular.

## Licencia de Remotion

Remotion es gratis para personas y para empresas de hasta 3 empleados. Las más grandes necesitan una [licencia de empresa](https://www.remotion.dev/license).
