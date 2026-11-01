# 0021 — Invertir desde la carga y "Libre este mes" con lo separado

Fecha: 2026-11-01 · Fase 24 (MOV-07, CTA-06, DAS-05)

## Contexto

La fase 24 descuenta de "Libre este mes" lo que el usuario separó para ahorrar o invertir. La arquitectura dice que se use el `baseAmount` congelado de cada transferencia, pero `Transfer` no guarda cotización ni monto en moneda base: solo `amountOut`, `amountIn` y `currencyIn`. El plan pedía consultar cómo valuarla antes de elegir. Se propuso esta opción y se aprobó junto con el plan.

## Decisiones

**Valuación de una transferencia en moneda base** (`transferBaseValue` en `libs/domain`), sin cambiar el esquema:

- Si uno de los dos lados está en moneda base, se usa ese monto: son los pesos (o dólares) que realmente salieron o entraron.
- Si ninguno lo está (por ejemplo, de USD a USD con base ARS), se valúa el monto que sale con la cotización de la **fecha de la transferencia**, igual que los consumos con tarjeta en el inicio. Sin cotización conocida vale cero.

**Separado del mes** (`separatedThisMonth`): suma las transferencias de `AVAILABLE` a `SAVINGS` o `INVESTMENT` y resta las inversas. Las demás no cuentan, y tampoco los pagos de resumen (no tienen apartado de destino). `freeThisMonth` recibe `separated` como cuarto parámetro y vive en `free.ts`.

**Filtro `type=INVESTMENT`** en `GET /movements`: incluye las transferencias a un apartado de inversión desde otro tipo (INVEST) y las de un apartado de inversión a uno disponible (REDEEM). Un rescate desde un **ahorro** también tiene intención REDEEM, pero no es una inversión, así que no entra en el filtro "Inversiones".

**Ajuste de un apartado de inversión**: `POST /pockets/:id/adjust` responde `USE_VALUATION` (422). En la web, la misma hoja de ajuste cambia según el tipo: en inversión se titula "Actualizar valor" y guarda una valuación de ese apartado con `POST /investments/valuations`.

**Carga rápida**:

- El cuarto segmento es "Invertir". Para que los cuatro entren a 360 px, "Transferencia" pasa a **"Transferir"** (verbo, como "Invertir").
- Invertir: el origen puede ser un Disponible o un Ahorro (como la acción rápida "Invertir" de CTA-05), y por defecto es el apartado usado la última vez si es de esos tipos; si no, el Disponible de esa misma cuenta. Rescatar: el destino es siempre un Disponible.
- "+ Nueva inversión" abre el formulario de apartado de inversión sin cuenta elegida (el formulario la pide), así se puede crear en cualquier cuenta.
- Sin el plan que incluye inversiones, el segmento lleva la marca "Pro" y abre la hoja del plan, como en el formulario de apartado.

**Lista de movimientos**: "Invertiste $ X en <apartado>" y "Rescataste $ X de <apartado>" con el monto que sale; la nota, si hay, pasa al subtítulo. El título de estas filas puede ocupar dos líneas (`wrap` en `pl-list-item`).

## Consecuencias

- No hay migración. Si más adelante se congela la cotización de las transferencias, `transferBaseValue` deja de hacer falta y el histórico de "Libre" ya no cambia cuando se carga una cotización vieja.
- Una transferencia entre dos monedas que no son la base, de una fecha sin cotización, no cuenta como separada.
