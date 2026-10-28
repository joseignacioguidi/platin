# 0012 — Inversiones como apartados con valuación manual

Fecha: 2026-10-27 · Fase 11

## Contexto

Una inversión es un apartado de tipo inversión. Su saldo se calcula como el de cualquier otro apartado, y cada tanto se carga a mano su valor real. La diferencia queda como rendimiento (INV-01 a 05).

## Decisiones

- **Invertido neto:** es el saldo inicial del apartado más las transferencias que entraron, menos las que salieron.
  - La especificación habla solo de transferencias. Se suma también el saldo inicial porque un apartado de inversión creado con plata adentro es plata invertida; si no, su rendimiento en porcentaje no tendría base.
- **Porcentaje:** es el rendimiento acumulado sobre el invertido neto, como ratio con 4 decimales ("0.0800"). Sin plata invertida es `null`.
- **Rendimiento del último período:** es el de la última valuación (cero si no hay).
- **Fecha de una valuación:**
  - Tiene que ser **posterior a la última** del apartado (`VALUATION_NOT_LATEST`) y **no puede estar en el futuro** (`VALUATION_IN_FUTURE`).
  - Así se cumple "una por apartado y fecha", y "borrar solo la última" siempre deja el saldo consistente.
- **Carga en lote:** va todo o nada. Si una inversión falla, no se guarda ninguna.
- **Movimiento de rendimiento:**
  - El rendimiento se calcula contra el saldo **a la fecha de la valuación**, no contra el de hoy.
  - Se registra como movimiento `YIELD` (origen `VALUATION`, categoría de sistema Rendimientos), con su valor en moneda base congelado con la cotización de ese día.
  - Si la diferencia es cero, no se crea movimiento.
- **Inicio y "Libre este mes":** no incluyen los rendimientos, porque ya sumaban solo `INCOME` y `EXPENSE`; los tests lo verifican.
  - El aviso de actualizar aparece si pasó **más de un mes** (el mismo día del mes siguiente, ajustado al largo del mes) desde la última valuación o, si nunca hubo una, desde que se creó la primera inversión.
- **Totales en moneda base:** usan la cotización preferida del día. La composición por instrumento usa el valor actual de cada apartado.
- **"Actualizar valores":** muestra la diferencia en vivo contra el saldo de hoy. La API la calcula contra el saldo a la fecha elegida, así que puede diferir si hubo movimientos posteriores a esa fecha.

## Consecuencias

- Endpoints nuevos: `GET /investments`, `POST /investments/valuations`, `DELETE /valuations/:id` y `GET /pockets/:id/valuations` (para el historial del apartado).
- El inicio suma el campo `valuationsOverdue` para mostrar el aviso.
