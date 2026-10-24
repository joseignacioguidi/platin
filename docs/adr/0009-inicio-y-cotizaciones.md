# 0009 — Inicio ("Libre este mes") y cotizaciones

Fecha: 2026-10-24 · Estado: propuesta (a confirmar por Jose)

## Contexto

La fase 6 agrega cotizaciones automáticas (DolarApi) y el inicio (DAS-01). La especificación define "libre = ingresos esperados − comprometido − gastado", pero no qué entra en cada término.

## Decisiones

### Cotizaciones

1. `RateProvider` es una interfaz; `DolarApiProvider` hace un solo pedido a `/v1/dolares` y mapea oficial → OFICIAL, blue → BLUE, bolsa → MEP. Los montos se leen como texto antes de `JSON.parse`, así nunca pasan por `float`.
2. Se refresca cuando no hay cotización del día o la última tiene más de una hora. Lo disparan `POST /sync`, `GET /rates/latest`, el inicio y cualquier movimiento que necesite cotización; no hay cron. Si la fuente falla, se usa la última guardada y se informa `stale: true`.
3. Un movimiento en otra moneda congela la cotización **de su fecha** (o la anterior más cercana) del tipo preferido del usuario, precio de **venta**. Si el request trae `exchangeRate`, manda. Los pendientes de fijos en otra moneda congelan la de su fecha al confirmarse.

### Inicio (todo en moneda base)

- **Ingresos esperados** = fijos de ingreso del mes (el monto confirmado si ya se confirmó; si no, el esperado) + otros ingresos confirmados del mes.
- **Gastado** = gastos confirmados del mes + consumos con tarjeta del mes por su total (los de otra moneda, con la cotización de su fecha).
- **Comprometido** = lo que falta pagar este mes: lo pendiente de los resúmenes no pagados que vencen en el mes + fijos de gasto del mes todavía no confirmados.
- **Libre** = ingresos esperados − comprometido − gastado (puede ser negativo).
- **Próximos 30 días** = vencimientos de resúmenes con saldo pendiente + ocurrencias de fijos no confirmadas.

## Consecuencias

- Una compra con tarjeta suma en "gastado" el día que se hace; su resumen suma en "comprometido" del mes en que vence solo si es de una compra de meses anteriores. Así una misma compra no cuenta dos veces en el mismo mes, aunque en un mes puntual pueda verse en los dos lugares si su resumen vence ese mismo mes (compras de principio de mes con cierre temprano). Se revisa con uso real.
- En los tests, la API usa un `FakeRateProvider` (sin red).
