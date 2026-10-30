# 0017 — Límites de entrada y pagos de resumen

Fecha: 2026-10-30 · Hallazgos F10 y F11 del [informe de seguridad](../seguridad/informe-2026-10-30.md)

## Contexto

Las pruebas de seguridad encontraron entradas válidas según los esquemas que terminaban en un 500: montos en dólares que, convertidos a pesos, no entran en `Decimal(18,2)`; fechas cerca del año 9999, donde el mes siguiente es `10000-01`; bodies de más de 100 kB y el carácter NUL, que Postgres no guarda en columnas de texto. También se podía pagar un resumen por más de lo pendiente, algo que la especificación no definía.

## Decisiones

- **Años entre 1900 y 2999** en todas las fechas y períodos (`localDateSchema` y `periodSchema` de `contracts`, constantes `MIN_YEAR` y `MAX_YEAR`). Fuera de ese rango, 400. El dominio sigue aceptando cualquier año de cuatro cifras, así que las cuentas internas de un consumo de 2999-12 que pasa a 3000-01 funcionan.
- **Monto demasiado grande en moneda base:** el filtro de Problem Details convierte el error de Prisma `P2020` en 422 `AMOUNT_TOO_LARGE`. Cubre todos los caminos que congelan montos (movimientos, confirmaciones, ajustes, fijos, valuaciones) sin repetir el cálculo en cada servicio.
- **Body demasiado grande:** los errores de body-parser con `expose: true` y status 4xx se respetan: 413 `PAYLOAD_TOO_LARGE`. El límite sigue siendo el de Nest (100 kB).
- **Carácter NUL:** un pipe global (`RejectNulPipe`), que corre antes que Zod, rechaza con 400 cualquier string del body, la query o los parámetros que lo contenga. El filtro mapea igual el error de Postgres (22021) como última defensa.
- **Pagos de resumen (TAR-08):** un pago no puede superar lo pendiente en su moneda: 422 `PAYMENT_EXCEEDS_PENDING`, con `pending` y `currency` como miembros de extensión. Pagar exactamente lo pendiente deja el resumen `PAID`.

## Consecuencias

- Códigos de error nuevos: `AMOUNT_TOO_LARGE`, `PAYLOAD_TOO_LARGE` y `PAYMENT_EXCEEDS_PENDING`, con su mensaje en `apps/web/src/app/core/errors.ts`.
- Los tests `[SEC-F10]` de `input.e2e-spec.ts` y `SEC-LOGIC-05` cubren cada caso.
- Dos pagos simultáneos al mismo resumen todavía podrían sumar más que lo pendiente, porque el chequeo no bloquea el resumen. Es un caso de doble envío de la misma persona, y la web ya deshabilita el botón mientras envía (F15).
