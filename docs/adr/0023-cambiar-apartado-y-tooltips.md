# 0023 — Cambiar el apartado al editar y tooltips en los gráficos

Fecha: 2026-11-01 · Fase 26 (MOV-04, DAS-06)

## Decisiones

**Cambiar el apartado (MOV-04).**

- `PATCH /transactions/:id` con `pocketId` de otra moneda responde `CURRENCY_MISMATCH` (422). Antes se permitía y se recongelaba la cotización; ahora para cambiar de moneda hay que borrar el movimiento y cargarlo de nuevo.
- Los ajustes y rendimientos ya no se podían editar (`ADJUSTMENT_NOT_EDITABLE`, `YIELD_FROM_VALUATION`), así que la regla "ADJUSTMENT y VALUATION no cambian de apartado" ya se cumplía.
- Un apartado de otro usuario es 404, igual que antes.
- En la web, el campo "Cuenta" de la hoja de edición usa `pl-pocket-select` filtrado por la moneda del movimiento, agrupado por cuenta, y muestra "Cuenta · Apartado". Debajo, un texto explica que para cambiar de moneda hay que borrarlo y cargarlo de nuevo.

**Tooltips (DAS-06).**

- `PlChartPoint` (directiva `[plChartPoint]` en `libs/web-ui`) hace enfocable cada barra, segmento o punto (`role="img"`, `tabindex="0"`) y le pone un `aria-label` "etiqueta: valor" que respeta "ocultar montos". `PlChartTooltips` maneja un único tooltip (CDK Overlay): sigue al mouse, se ubica junto al elemento al enfocarlo o tocarlo, nunca sale de la pantalla (`withPush`) y se cierra con Escape, al salir o al tocar afuera. El monto va con `pl-money`.
- Los contenedores de los gráficos pasan de `role="img"` a `role="group"`, para que los puntos sigan siendo accesibles.
- La barra apilada agranda el área táctil a 44 px de alto sin cambiar el dibujo, y recibe `currency`.
- Gráficos con tooltip: barra de "Libre" (inicio), composición (inversiones), reparto por moneda y avance de cada meta (ahorros), anillo de la meta, evolución del saldo (apartado), total por resumen, límite usado y avance de cada plan de cuotas (tarjeta), altas por semana (administración). En la tarjeta, las etiquetas "45k" sobre las barras ahora respetan "ocultar montos".
- Sin tooltip: las barras de usuarios por plan y uso por funcionalidad (administración) y el uso del plan, porque el número exacto ya está escrito al lado de cada barra. Compromisos, detalle de cuenta y "Actualizar valores" no tienen gráficos.
