# 0041 — Inversiones con precio: decisiones de implementación

Fecha: 2026-11-25 · Iteración 15, fases 42 a 44. Completa el ADR 0040 con lo que se decidió al construirla y con lo que mostraron las APIs reales.

## Lo que cambió respecto del ADR 0040 y la arquitectura

- **ArgentinaDatos no informa la moneda de los fondos.** Cada fila trae `fondo`, `horizonte`, `fecha`, `vcp`, `ccp` y `patrimonio`, sin moneda. La moneda sale del nombre: "Dólar", "Dólares", "U$S", "USD", "US$" o "Dollar" → dólares; el resto, pesos. Si un fondo en dólares no lo dice en el nombre, queda en pesos y no se puede vincular a un apartado en dólares (`INSTRUMENT_CURRENCY_MISMATCH`). En ese caso se sigue a mano.
- **El histórico de ArgentinaDatos es por categoría y fecha.** No hay uno por fondo: `GET /v1/finanzas/fci/{categoria}/{AAAA}/{MM}/{DD}` devuelve todos los fondos de esa categoría ese día. Para la valuación de fin de mes se pide ese día y, si el fondo no está (fin de semana o feriado), hasta 7 días hacia atrás.
- **La categoría `otros` no entra.** Lista cuentas remuneradas (con TNA), no fondos con valor cuotaparte.
- **El catálogo de FCI trae 4.518 filas**, muchas de fondos cerrados (Superfondo 2000, de 2020). Quedan afuera los que tienen su último valor hace más de 10 días hábiles, contando de lunes a viernes. Los feriados no se conocen y cuentan como hábiles. Un nombre que aparece en dos categorías (13 casos) es un solo instrumento, con la fila más nueva.
- **Data912 no trae nombre ni moneda.** Solo `symbol` y precios (`c` es el último operado). Cada CEDEAR o acción aparece en pesos (`AAPL`), en dólares MEP (`AAPLD`) y en dólares cable (`AAPLC`). Un ticker que termina en D o en C (también `.D`, como `BMA.D`) es la versión en dólares **solo si** el ticker sin la letra está en el panel y vale al menos 100 veces más. Hay tickers reales en pesos que terminan en D (`AMD`, `HD`, `GLD`, `HOOD`, `BBD` de Bradesco, `YPFD`), y la comparación de precios los deja en pesos. El nombre que se muestra se arma: "AAPL · CEDEAR en dólares MEP".
- **El panel de Data912 no tiene fecha.** El precio se fecha con el día de mercado: hoy, o el viernes si es fin de semana.
- **El histórico de Data912 existe solo para los tickers en pesos.** Para `AAPLD` responde un error ("no tengo ese ticker"). En esos casos la valuación de fin de mes usa el último precio guardado hasta esa fecha.
- **CoinGecko fecha su histórico a las 00:00 UTC.** El valor al cierre del 30/11 es el que informa para el 01/12.
- **Precios con 6 decimales.** Los precios se guardan como las cotizaciones (`Decimal(18, 6)`). Una cripto de menos de un millonésimo de dólar se redondea, y si queda en cero no se guarda.
- **`pricing.listing` en lugar de `instrument`.** El apartado ya tiene un campo `instrument` (el tipo: CEDEAR, FCI…), así que el instrumento vinculado va dentro de `pricing`, como `listing` (id, símbolo, nombre, tipo y moneda).

## Decisiones nuevas

- **Rescatar un plazo fijo.** Lo que sale del apartado desde la fecha de constitución se resta del valor calculado (nunca por debajo de cero). Si se rescata todo al vencimiento, el valor queda en cero, ya no figura como "Vencido" (`redeemed: true`), y la valuación de fin de mes registra como rendimiento el interés que no se había valuado. Ejemplo: $ 1.000.000, valuado $ 1.023.835,62 el 30/11, rescatado por $ 1.024.657,53 → el 31/12 se registran $ 821,91 de rendimiento.
- **Valuación automática solo desde que hay valor automático.** No se valúa un mes en el que el apartado todavía no estaba vinculado o el plazo fijo no estaba constituido. Para un vinculado cuenta la fecha en que se vinculó; para un plazo fijo, la de constitución. Si un vinculado no tiene ningún precio hasta esa fecha, no se valúa.
- **Una valuación automática borrada vuelve a crearse** en el próximo `POST /sync` del mes, porque la regla es idempotente sobre "hay una valuación en esa fecha o después". Para corregirla, se carga una valuación manual posterior.
- **"Valores cargados a mano" y el aviso de INV-03** miran solo las inversiones a mano: la fecha de la última actualización no incluye las automáticas.
- **Cambiar el tipo o el uso de un apartado** borra su vínculo o sus condiciones de plazo fijo. Pasa a manual y conserva valuaciones y movimientos.
- **"Pasar a manual" borra las correcciones de cantidad** junto con el vínculo. Las unidades que quedaron en las transferencias siguen ahí, como historial.
- **Cantidad nunca negativa en ninguna fecha.** No solo al final: rescatar, corregir, vincular con una cantidad inicial o borrar una compra ya vendida responde `HOLDING_UNITS_NEGATIVE`. Dentro de un mismo día, lo que entra cuenta antes que lo que sale.
- **Unidades en transferencias.** Si un lado es un apartado vinculado son obligatorias (`UNITS_REQUIRED`). En cualquier otra transferencia no se aceptan (`UNITS_NOT_LINKED`, código nuevo). Las transferencias que crea la conexión con Mercado Pago no llevan unidades y no cambian la cantidad.
- **Catálogo una vez por día por proceso.** El día de la última descarga de cada fuente se guarda en memoria, sin tabla nueva. Si Render se reinicia, la primera búsqueda vuelve a bajarlo, y también si la tabla del catálogo está vacía.
- **Frescura.** Data912 y CoinGecko: más de una hora desde que se pidió. FCI: el valor guardado es anterior al día hábil previo a hoy y pasó más de una hora desde el último pedido (si la fuente todavía no publicó, no se le pide en cada pantalla).
- **Un instrumento sin precio** (vinculado a un ticker que nunca operó) muestra el saldo del apartado, `price: null` y `stale: true`, hasta que llegue el primero.
- **Fuentes apagables.** Cada fuente se apaga dejando vacía su variable (`PRICES_ARGENTINADATOS_URL`, `PRICES_DATA912_URL`, `PRICES_COINGECKO_URL`). `GET /instruments` responde `priced: false` para esos tipos. En los tests no se llama nunca a una fuente real: `createTestApp` usa `priceProviders` (vacío por defecto) y los e2e corren los proveedores reales contra un `fetch` falso.
- **Endpoints que no estaban en la arquitectura:**
  - `GET /pockets/:id/investment` (la inversión con su `pricing`, para el detalle del apartado).
  - `GET /pockets/:id/holding/adjustments` (el historial de correcciones).
  - El código `HOLDING_NOT_LINKED` (corregir la cantidad de una inversión sin vínculo).
- **Web.**
  - Al invertir en CEDEARs y acciones se proponen unidades enteras (las que alcanza el monto, hacia abajo); en FCI y cripto, hasta 8 decimales.
  - Los mockups de `docs/mockups/inversiones-precio/` no existían: la interfaz sigue las pantallas actuales. Son el selector de instrumento dentro del formulario del apartado y una tarjeta en el detalle del apartado con la cantidad, el precio con su fecha, "Corregir cantidad" y "Pasar a manual".
  - "Pasar a manual" se confirma dentro de la misma tarjeta, sin diálogo del navegador.

## Consecuencias

- Hay una sola migración (`20261125120000_investment_prices`) con todo el esquema de la iteración y restricciones `CHECK`: unidades positivas, precio positivo y condiciones del plazo fijo válidas.
- `parseQuotedJson` (en `common/`) reemplaza al helper de `rates`. Acepta claves anidadas y exponentes.
- Data912 sigue siendo un proyecto de terceros sin garantías, y la regla de la moneda depende de su forma actual. Si cambia, los tests con las respuestas guardadas lo van a mostrar.
