# 0040 — Inversiones con precio automático

Fecha: 2026-11-23 · Iteración 15, fases 42 a 44 (INV-07 a INV-12). Completa el ADR 0012.

## Contexto

Hoy una inversión es un apartado con un saldo en plata que se actualiza a mano una vez por mes (ADR 0012). La app no sabe *qué* tenés (20 CEDEARs de Apple, 150 cuotapartes de Super Ahorro $), solo *cuánto* vale según lo que cargaste. La especificación dejaba "Cotización automática de inversiones" fuera de alcance.

Hay fuentes gratuitas que cubren casi todo lo que usa un inversor argentino chico, pero ninguna cubre todo:

| Fuente | Qué da | Qué no da |
| --- | --- | --- |
| [ArgentinaDatos](https://argentinadatos.com/docs/) | Valor cuotaparte diario de todos los FCI informados a la CAFCI, por categoría (mercado de dinero, renta fija, variable, mixta, retorno total, otros), con histórico por fondo. Incluye los Superfondos de Santander con cada clase | CEDEARs, acciones, cripto |
| [Data912](https://data912.com) | Paneles de CEDEARs, acciones y bonos argentinos, con histórico OHLC por ticker. Sin clave | Tiempo real: se presenta como datos de hobby, con caché de unas 2 horas. FCI |
| [CoinGecko](https://www.coingecko.com/en/api) | Precio de criptomonedas en USD (plan gratuito, clave opcional) | Mercado argentino |

El plazo fijo no necesita fuente: su valor sale de capital, TNA y días.

## Decisiones

- **Un apartado, un instrumento.** Se mantiene INV-01: cada instrumento que se quiere seguir tiene su propio apartado. Un apartado de inversión puede estar **vinculado** a un instrumento del catálogo (precio automático), ser un **plazo fijo** (valor calculado) o seguir **a mano** (como hoy). Lo existente queda a mano hasta que el usuario lo vincule.
- **Cantidad calculada, no guardada.** Igual que los saldos: cantidad = cantidad inicial + unidades de las transferencias que entraron − las que salieron ± correcciones. `Transfer.units` guarda las unidades solo cuando un lado es un apartado vinculado. Las correcciones (splits, dividendos en especie, diferencias con el broker) son filas de `HoldingAdjustment` con dirección, como los montos: siempre positivas.
- **Precisión.** Cantidades `Decimal(24, 8)` (las cuotapartes y las cripto usan muchos decimales), precios `Decimal(18, 6)` como las cotizaciones. Valor = cantidad × precio redondeado a 2 decimales, mitad hacia arriba. La cantidad que se propone a partir de un monto (monto ÷ precio) se redondea a 8 decimales, mitad hacia arriba, y se puede corregir.
- **Moneda del instrumento = moneda del apartado.** Un CEDEAR en pesos (AAPL) va en un apartado en pesos; uno en dólares (AAPLD), en uno en dólares; una cripto, en uno en dólares. Si no coinciden, `INSTRUMENT_CURRENCY_MISMATCH`. Así el valor nunca necesita una cotización intermedia.
- **Valor en vivo sin movimientos.** Inversiones muestra cantidad × último precio y el rendimiento contra el invertido neto, pero **no** crea un movimiento cada vez que cambia el precio. El saldo del apartado (y por lo tanto el patrimonio) se mueve con la valuación automática mensual.
- **Valuación automática mensual.** El primer `POST /sync` de cada mes crea, por cada apartado vinculado o plazo fijo, una `PocketValuation` con `source = AUTO` fechada el último día del mes anterior, con el precio de ese día o el anterior más cercano (del histórico del proveedor si no está guardado). Genera su movimiento `YIELD` como cualquier valuación (ADR 0012). Es idempotente: si ya hay una valuación en esa fecha o una posterior, no hace nada.
- **Proveedores detrás de una interfaz.** `PriceProvider` (como `RateProvider`) con tres implementaciones y un registro que elige por `Instrument.source`. Cada proveedor descarga listas completas (un panel, una categoría de FCI, un pedido de varias cripto), no instrumento por instrumento. Si uno falla, los otros siguen y el instrumento muestra su último precio guardado con su fecha (`stale`).
- **Descarga perezosa, sin cron.** Como las cotizaciones: al pedir `GET /investments` o en `POST /sync`, si el último precio de un instrumento en uso tiene más de una hora (CEDEARs, acciones, cripto) o es de un día hábil anterior (FCI), se pide de nuevo. El catálogo para buscar se refresca una vez por día.
- **Catálogo compartido.** `Instrument` e `InstrumentPrice` no son datos de un usuario (como `ExchangeRate`). Lo del usuario es `PocketHolding`, `HoldingAdjustment` y `TermDeposit`, que cuelgan de su apartado y se filtran por `userId` a través de él.
- **Números sin float.** Las tres APIs devuelven números JSON; se citan antes de `JSON.parse`, como `parseQuoted` en `rates` (que se generaliza a `common/`).
- **FCI y sus clases.** El catálogo de FCI es por clase ("Super Ahorro $ - Clase A"), porque cada clase tiene su valor cuotaparte. Se ocultan los fondos cuyo último valor tiene más de 10 días hábiles (dados de baja, como "Superfondo 2000").
- **Plazo fijo.** Interés simple: valor a la fecha F = capital + capital × TNA × días ÷ 365, con días = desde la constitución hasta F, sin pasar del vencimiento. Después del vencimiento el valor queda fijo y la inversión se marca "Vencido" hasta que se rescata. Renovarlo es rescatar y volver a invertir, o editar sus condiciones.
- **"Actualizar valores".** Los apartados automáticos se listan con su valor y la fecha del precio, sin campo para cargar. No cuentan para el aviso de INV-03: si todos son automáticos, el aviso no aparece.
- **Plan.** La misma marca `investments`; no hay una marca nueva.

## Fuera de esta iteración

- Bonos y ONs: Data912 los cotiza cada 100 de valor nominal y suman cupones y amortizaciones; necesitan su propio `InstrumentType` y reglas.
- Dividendos y splits automáticos: se cargan como corrección de cantidad o como ingreso.
- API de IOL o de BYMA: quedan como proveedores alternativos si Data912 deja de servir.
- Renovación automática de plazos fijos y plazos fijos UVA.

## Consecuencias

- Esquema nuevo: `PriceSource`, `ValuationSource`, `HoldingDirection`, `Instrument`, `InstrumentPrice`, `PocketHolding`, `HoldingAdjustment`, `TermDeposit`; `Transfer.units` y `PocketValuation.source`.
- Módulo nuevo `prices` (catálogo, descarga y caché) y endpoints en `investments` para vincular, corregir cantidad y condiciones del plazo fijo.
- Variables de entorno nuevas con la URL de cada proveedor (y la clave opcional de CoinGecko).
- El patrimonio del inicio sigue usando el saldo de los apartados: entre una valuación mensual y la siguiente puede diferir del valor en vivo de Inversiones. Queda como pregunta abierta si conviene usar el valor en vivo también ahí.
- Data912 es un proyecto de terceros sin garantías; antes de abrirlo a usuarios pagos hay que revisar sus condiciones de uso.
