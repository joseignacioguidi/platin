# 0032 — Detalles de la navegación reagrupada

Fecha: 2026-11-06 · Fase 36 (complementa a `0031-navegacion-reagrupada.md`)

## Contexto

Al implementar la fase 36 aparecieron algunos puntos que ni la especificación ni la arquitectura fijaban.

## Decisión

- **Ancho de la barra lateral**: pasa de `w-64` a `w-68` (272 px). Con el pie nuevo (avatar, nombre, "Perfil y ajustes" y dos botones de 44 px), "Perfil y ajustes" no entraba en una línea. El contenido ya arrancaba en 288 px (`lg:pl-72`), así que no cambia nada más.
- **Dos columnas "desde lg"**: el perfil y Próximos meses usan columnas que se acomodan solas, como en el mockup (`flex: 3 1 520px` y `2 1 340px`; `1 1 300px` y `2 1 480px`). Con la barra lateral, a 1024 px no entran y se apilan, que es lo que pide el criterio de terminado.
- **Guardado automático de monedas** (AUTH-10): cada cambio manda solo el campo tocado (`PATCH /users/me` acepta parciales). Mientras guarda, el selector muestra el valor nuevo; si falla, vuelve al anterior y muestra el error.
- **"De eso, invertido"**: la pestaña Metas y ahorros pide `GET /investments` solo cuando el plan ya cargó, lo incluye y hay reservas de inversión. Si no, la API respondería `FEATURE_NOT_IN_PLAN` y se abriría la hoja del plan sin que el usuario hiciera nada.
- **"+ Reserva de inversión"** se muda de Metas y ahorros al pie de la pestaña Inversiones. Metas y ahorros deja una línea que avisa dónde están.
- **Contador de pendientes**: cuenta solo los movimientos `TRANSACTION`, como la pestaña. Con otra página de resultados muestra "99+". El número va en `ink` en claro y en `on-ink` en oscuro (#181818 en los dos temas), porque `ink` en oscuro es casi blanco y sobre `pending` no llega a AA.
- **"Cargalo como fijo"** (Próximos meses) y "+ Cargar un ingreso fijo" (Fijos) abren el formulario de fijos ya en Ingreso (`FixedFormPreset`).
- **Reglas desde Personalización**: `/app/categorias?vista=reglas` abre Categorías en la pestaña Reglas.
- **Pestañas como enlaces**: `pl-section-tabs` usa `<nav>` con enlaces y `aria-current="page"`, no `role="tab"`, como dice la arquitectura. El mockup usa `role="tab"`.

## Consecuencias

- Otros lugares que ya usaban `bg-pending text-ink` (la marca "Atrasado" de las metas y los pendientes de Movimientos) tienen el mismo problema de contraste en oscuro. Queda para otra tarea.
