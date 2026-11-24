# Video publicitario de platin

Video vertical (1080×1920, 30 fps) hecho con [Remotion](https://www.remotion.dev): React que se renderiza a MP4.

- `Platin30`: 30 segundos.
- `Platin15`: 15 segundos, con las mismas escenas.

Es un proyecto aparte, fuera del workspace de Nx (`.nxignore`). Tiene su propio `package.json` y `pnpm-lock.yaml`.

## La historia: "El saldo te engaña" (v3)

1. **Problema, sobre fondo ink.** El saldo de tus cuentas parece mucho. Caen tres cosas que ya tienen destino:
   - el resumen de la tarjeta;
   - el alquiler y los servicios;
   - lo que apartaste para el viaje.

   El saldo queda tachado y se vuelve "¿?".
2. **Solución, sobre fondo verde.** En el celular, la app real hace la cuenta:
   - "Te quedan para gastar" sube hasta el número verdadero y se resalta el "por día";
   - las cuotas aparecen mes a mes;
   - se muestra la meta del viaje.
3. **Cierre, sobre fondo blanco.** La carita de platin pestañea una vez, con el lema y "Empezá gratis".

Los tres problemas son exactamente lo que el inicio de la app resta para llegar al "Libre este mes" (`docs/especificacion.md`, regla "Libre este mes"). Los montos salen de los datos de prueba y cierran: saldo − tarjeta − fijos − ahorro = lo que muestra la app.

Las versiones anteriores están en las etiquetas de git `video-tarjetas-v1` y `video-tarjetas-v2`.

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

## Renderizar

```bash
pnpm render:30              # out/platin-30s.mp4: voz, efectos y música
pnpm render:30:sin-musica   # out/platin-30s-sin-musica.mp4: voz y efectos
pnpm render:15              # out/platin-15s.mp4
pnpm render:15:sin-musica   # out/platin-15s-sin-musica.mp4
pnpm still                  # out/portada.png (frame 85, para miniatura)
pnpm render                 # todo lo anterior
```

La versión sin música sirve para Reels y TikTok, donde el audio en tendencia se elige al publicar. Mientras no haya `public/music.mp3`, las dos versiones son iguales.

Para sacar un frame suelto: `pnpm exec remotion still src/index.ts Platin30 out/frames/f420.png --frame=420 --scale=0.5`.

`out/` y `entregas/` no se versionan. En `entregas/<problema>-v<n>/` quedan las copias para subir a Drive.

## Los tiempos los marca la voz

Cada tramo del video es una frase de la voz con lo que se ve mientras se dice (`CONFIG.beats` en `src/config.ts`). El tramo dura lo que dura su frase, más una pausa corta. El cierre se estira para completar los 30 o 15 segundos. Si cambiás un texto, la animación se acomoda sola.

- Antes de generar la voz, los tiempos se estiman, a unos 16 caracteres por segundo.
- Una frase cuyo texto cambió no suena hasta que la vuelvas a generar.
- `pnpm voiceover --dry` muestra si cada versión entra en su duración, sin gastar créditos.

## Voz en off (ElevenLabs)

1. Copiá `.env.example` a `.env` y completá:
   - `ELEVENLABS_API_KEY`: en *Developers › API Keys*, con permiso de Text to Speech.
   - `ELEVENLABS_VOICE_ID`: en *Voices*, *Copy voice ID*. Para usar voces de la Voice Library por API hace falta un plan pago (Starter alcanza), que además da licencia comercial.

   `.env` no se versiona.
2. Generá:
   ```bash
   pnpm voiceover --dry           # tiempos estimados, sin pedir nada
   pnpm voiceover --only 30-07    # una sola frase, para probar voz o velocidad
   pnpm voiceover                 # todo; solo pide lo que cambió
   pnpm voiceover --force         # rehace todo
   ```
   Los archivos van a `public/voice/<versión>-<n>.mp3` y se versionan, así se puede volver a renderizar sin gastar créditos.

La velocidad está en `CONFIG.audio.voiceSpeed` (1,1), porque es parte del ritmo del video. Una frase puede tener la suya (`voiceSpeed` en su beat): el cierre va a 0,8 para que la marca y el lema se escuchen con calma. Si las frases salen más cortas que el video, el tiempo que sobra se reparte como pausa después de cada una (el cierre suma hasta 1,3 s).

Para comparar voces sin tocar la del video: `node scripts/voice-try.mjs --voices id1,id2` graba las dos frases donde gira la historia con cada voz en `out/pruebas-voz/`. Para buscar voces por API, la clave necesita además el permiso *Voices: Read*. La voz lee "Platín", con tilde, para acentuarlo bien; en pantalla la marca sigue siendo "platin".

## Música y efectos

- **Música (ElevenLabs Music).** `pnpm music` genera una pista instrumental por versión (`public/music-30.mp3`, `public/music-15.mp3`) en tres secciones (problema, solución y cierre) que duran exactamente lo mismo que cada parte del video, así el cambio de clima cae en "Platín hace esa cuenta por vos".
  - La descripción de cada sección está en `CONFIG.music` (`src/config.ts`).
  - Corré `pnpm music` después de `pnpm voiceover`, porque los tiempos salen de la voz. Si el plan no cambió, no vuelve a generar; `--force` pide otra toma y `--dry` muestra las secciones.
  - Consume unos 900 créditos por minuto (las dos versiones, unos 700). La clave necesita el permiso *Music*. El plan Starter permite uso comercial.
  - El volumen debajo de la voz está en `CONFIG.audio.musicUnderVoiceVolume`.
- `pnpm sfx` sintetiza los efectos en `public/sfx/`, sin licencias:
  - `tick`: cae un ticket;
  - `whoosh`: las transiciones;
  - `pop`: cada cuota y el guiño;
  - `click`: el "por día".

  Volumen en `CONFIG.audio.sfxVolume` (`0` los apaga).

## Las pantallas de la app

Las capturas de `public/captures/` son de la app real, con datos ficticios. Se versionan. Para regenerarlas:

1. Levantá la app en local: `docker compose up -d`, la API en el 3000 y la web en el 4200 (README principal).
2. Cargá los datos de prueba:
   ```bash
   pnpm seed
   ```
   Crea o reinicia `demo@platin.test` con lo siguiente:
   - el sueldo;
   - Banco Galicia con la reserva "Viaje" y Mercado Pago;
   - una Visa que cerró el 15 y vence el 28: zapatillas en 6 cuotas, super, cena, heladera y celular;
   - el alquiler y los servicios de este mes;
   - $ 250.000 apartados para el viaje, con la meta al 60 %.

   Escribe `public/captures/story.json` con los montos de la historia, y falla si no cierran. Está pensado para correrse entre el 18 y fin de mes, para que el resumen y los fijos caigan en el mes actual.
3. Capturá:
   ```bash
   pnpm capture
   ```
   Playwright toma inicio, tarjeta (pestaña Cuotas) y metas en 390×844 con deviceScaleFactor 3. Por cada pantalla guarda:
   - la página entera sin los elementos fijos;
   - la vista del celular con la barra inferior;
   - en `meta.json`, la posición de lo que el video anima encima: el número del inicio, el "por día", las barras de cuotas y la meta.

## Dónde cambiar cada cosa

| Qué | Dónde |
|---|---|
| Frases de la voz, textos en pantalla, URL, velocidad y volúmenes | `src/config.ts` |
| Colores, tipografías, márgenes seguros, tamaño del celular | `src/theme.ts` |
| Cómo se calculan los tiempos | `src/timeline.ts` |
| Escenas (problema, solución, cierre) | `src/scenes/` |
| Montos de la historia | `scripts/seed-demo.mjs` (y volver a capturar) |

En los textos en pantalla, las palabras entre `*asteriscos*` se resaltan.

## Márgenes seguros

El texto importante queda fuera de los 250 px de arriba y de abajo, y deja 130 px a la derecha para los botones de Reels y Shorts (`SAFE` en `src/theme.ts`).

## Licencia de Remotion

Remotion es gratis para personas y para empresas de hasta 3 empleados. Las más grandes necesitan una [licencia de empresa](https://www.remotion.dev/license).
