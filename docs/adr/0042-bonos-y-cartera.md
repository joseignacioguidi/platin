# 0042 — Bonos, alta coherente y cartera

Fecha: 2026-11-28 · Iteración 16, fases 45 y 46 (INV-13 a INV-17). Completa los ADR 0040 y 0041 con lo que surgió al usar las inversiones con precio en producción.

## Contexto

Después de la iteración 15, al usarla con una cartera real (Santander con 13 posiciones y Mercado Pago con 2) aparecieron cuatro problemas:

1. **Faltan los bonos.** GD46, GD35 y AL29 están cargados como "Otro" y se actualizan a mano. El ADR 0040 los había dejado afuera.
2. **El buscador no muestra el precio.** Al elegir un instrumento no se ve cuánto vale una unidad, y en la lista tampoco se ve la cantidad por el precio.
3. **El alta de una inversión vinculada es incoherente.** El formulario pide "Saldo de hoy" y la cantidad por separado, y no los cruza: se puede cargar $ 50.000 de saldo y una cantidad que vale $ 500.000. Además, el detalle sigue ofreciendo "Actualizar valor", y la API acepta una valuación manual sobre una inversión vinculada o un plazo fijo.
4. **Las inversiones no se leen como una cartera.** Con una reserva por instrumento (INV-01), el detalle de la cuenta muestra 16 filas de inversiones, y la pestaña Inversiones lista todas las posiciones una por una, sin composición ni pesos.

Data912 tiene los bonos soberanos en `GET /live/arg_bonds` (unos 200) y las ONs en `GET /live/arg_corp` (unas 600), con los mismos campos que los CEDEARs (`symbol`, `c` y puntas). Los precios son **cada 100 de valor nominal**: AL30D vale 49,61, o sea USD 49,61 por cada 100 nominales. Cada bono aparece en pesos (`AL30`), en dólares MEP (`AL30D`) y en dólares cable (`AL30C`), como los CEDEARs.

## Decisiones

- **Tipos nuevos `BOND` y `CORPORATE_BOND`** en `InstrumentType` ("Bono" y "ON"). La cantidad es el **valor nominal**, en enteros. El valor es nominales × precio ÷ 100, redondeado a 2 decimales, mitad hacia arriba. El precio se guarda tal como lo da la fuente (cada 100 VN). El divisor sale del tipo del instrumento (`priceBase`: 100 para bonos y ONs, 1 para el resto), no de una columna nueva.
- **La moneda de un bono** usa la misma regla que los CEDEARs (`tickerCurrency`, ADR 0041). La relación entre pesos y dólares de un bono también es de más de 100 a 1, así que la regla sirve sin cambios. Los tests lo verifican con el panel real guardado como fixture.
- **Cupones y amortizaciones como cobro sin unidades.** "Cobro de renta o amortización" saca plata del bono hacia una cuenta (una transferencia con intención `REDEEM` y la marca `payout: true`) sin tocar los nominales. Después del pago el precio del bono ya baja solo en el mercado, así que el valor queda bien sin corregir la cantidad. Es la única transferencia desde un apartado vinculado que no lleva `units`; solo se permite en bonos y ONs (`PAYOUT_NOT_ALLOWED` en el resto).
- **Precio en el catálogo.** Las tres fuentes ya traen el precio cuando se baja el catálogo (el `c` de Data912, el `vcp` de ArgentinaDatos y el precio de `/coins/markets`). Se guarda en `InstrumentPrice` en la misma descarga, y `GET /instruments` devuelve `price` y `priceDate` de cada resultado. No suma pedidos a las fuentes.
- **Una inversión vinculada siempre vale su cantidad por el precio.**
  - Al crearla se piden instrumento, cantidad y **"Cuánto pagaste"** (opcional; por defecto, el valor de hoy). No se pide "Saldo de hoy".
  - Lo pagado es el saldo inicial (lo invertido). En la misma transacción, la API vincula la reserva y registra una valuación automática con fecha de hoy por la diferencia con el valor de mercado. Así el saldo queda igual al valor desde el primer día y el rendimiento sale de lo que pagaste.
  - Vincular una reserva que ya existe hace lo mismo: valuación automática de hoy al valor de mercado.
  - Una inversión vinculada o un plazo fijo **no aceptan valuaciones manuales** (`VALUATION_AUTOMATIC`, 409). El detalle no ofrece "Actualizar valor"; ofrece "Invertir más" (con cantidad) y, en bonos y ONs, "Cobro de renta o amortización".
  - Si ya hay una valuación con fecha de hoy o posterior, la de hoy no se crea. El precio sin dato (`price: null`) tampoco crea valuación: la reserva queda con lo pagado hasta que llegue el primer precio, y la valuación de fin de mes lo corrige.
- **Corrección única de lo que ya está en producción.** Un script (`apps/api/scripts/reconcile-linked-investments.mjs`) registra, para cada inversión vinculada cuyo saldo de hoy no coincide con su valor de mercado, una valuación automática con fecha de hoy. Se corre una vez después del deploy de la fase 45, con `--dry-run` primero. Lo invertido de esas reservas queda como se cargó.
- **La cartera es una vista, no una entidad.** No cambia el modelo: cada instrumento sigue siendo su reserva (INV-01), y así siguen funcionando la cantidad, la valuación de fin de mes y el rendimiento por posición. La cartera de una cuenta son sus reservas de inversión no archivadas. La cartera total son las de todas las cuentas. La agrupación se hace con los datos de `GET /investments`, que ya vienen agrupados por cuenta.
- **Dónde aparece la cartera.**
  - Detalle de la cuenta: una sola fila "Cartera" en lugar de una fila por inversión.
  - Ahorros e inversiones › Inversiones: una tarjeta por cuenta en lugar de la lista de posiciones.
  - Pantallas nuevas `/app/cuentas/:id/cartera` (una cuenta) y `/app/ahorros/inversiones/cartera` (todas).
- **Pesos y porcentajes en moneda base.** La composición, el peso de cada posición y el reparto por moneda se calculan sobre el valor en moneda base con la cotización preferida del día, como los totales de INV-05. Una moneda sin cotización no suma (vale cero) y la pantalla lo avisa. Los porcentajes van con 1 decimal y pueden no sumar exactamente 100.
- **Evolución.** El valor a fin de cada mes es el saldo de cada reserva a esa fecha (después de la valuación automática, igual al valor de mercado), pasado a moneda base con la cotización de ese día o la anterior más cercana. El último punto es el valor en vivo de hoy. Lo invertido se dibuja al lado, para ver cuánto es aporte y cuánto rendimiento. Lo calcula `GET /investments/history` en la API. Si no hay cotización histórica, ese mes cuenta solo lo que está en moneda base.
- **Gráficos propios en SVG**, como `pl-stacked-bar` y el anillo de `pl-progress`: un `pl-donut` y un `pl-line-chart` nuevos en `libs/web-ui`. Sin dependencias nuevas.

## Consecuencias

- Migración con los dos valores nuevos de `InstrumentType` y `Transfer.payout Boolean @default(false)`. La restricción de unidades del ADR 0041 permite `units` nulo cuando `payout` es `true`.
- Data912Provider suma los paneles `arg_bonds` y `arg_corp`. El histórico de bonos (`/historical/bonds/{ticker}`) existe solo para los tickers en pesos, como en los CEDEARs: para AL30D, la valuación de fin de mes usa el último precio guardado.
- El selector de instrumento y las filas muestran el precio. En bonos y ONs se lee "1.000 VN × USD 49,61 c/100".
- Las reservas de inversión que hoy están como "Otro" (GD46, GD35, AL29) se pasan a "Bono" desde el formulario y se vinculan. Al vincularlas se valúan a mercado.
- ONs: el panel de Data912 no trae el nombre de la empresa. El buscador muestra el ticker ("PN35D · ON en dólares MEP") y se busca por ticker.
