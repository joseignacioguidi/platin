# 0013 — Landing nueva con el guiño

Fecha: 2026-10-28 · Fase 17

## Contexto

La landing pasa a la dirección "A + C" del canvas: el hero de C (titular enorme y recortes de colores) con la cara del guiño de A, las preguntas como títulos y el cierre oscuro de A (LAN-01, "Identidad visual y UX > Landing"). La referencia es `docs/mockups/landing/`.

## Decisiones

- **Siempre clara:** la landing es una pieza de marca y el mockup es claro. La clase `.pl-light` redefine los tokens claros sobre un subárbol, así que la landing se ve igual aunque el usuario tenga guardado el modo oscuro. Login y registro sí siguen el tema.
- **Movimiento:** el principal es el guiño del hero, que aparece con el globo de diálogo. Los recortes flotan suave, como en el mockup, y el guiño del cierre repite el del hero. No hay animaciones de entrada por sección. Con `prefers-reduced-motion` todo queda quieto, y el guiño queda guiñando.
- **Tipografía:** Uncut Sans llega hasta 700 (el mockup usa 900 con Inter Tight). Los titulares van en 700 con el mismo interletrado negativo.
- **`pl-wink`** en `libs/web-ui`: dibuja con `currentColor`, tiene la entrada `animated` y, si recibe `label`, es una imagen accesible; si no, es decorativo. Se usa en la landing, en login y registro, y en "Despertando el servidor".
- **Íconos:** el favicon, los íconos del manifest y el de Apple salen de `icono-guino.svg`. El maskable lleva el glifo sobre el verde de marca. La imagen para compartir se rehízo con el hero nuevo.
- **Capturas:** la landing ya no usa capturas de la app, así que se borraron las `.webp` de `public/landing`.
- **Montos de ejemplo:** son texto fijo en `landing.texts.ts`, no `pl-money`, porque no son datos del usuario y "ocultar montos" no aplica.

## Consecuencias

- Lighthouse en celular, sobre el build prerenderizado: rendimiento 99, accesibilidad 100, buenas prácticas 100, SEO 100.
- A 390 px no hay scroll horizontal y todos los enlaces miden 44 px de alto como mínimo.
