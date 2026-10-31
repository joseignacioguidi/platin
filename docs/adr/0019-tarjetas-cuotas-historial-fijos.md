# 0019 — Tarjetas: carga por cuota, historial y fijos en tarjeta

Fecha: 2026-10-31 · Fase 22 (TAR-02, TAR-09, TAR-12, TAR-13)

## Contexto

La fase 22 suma la carga por valor de cuota, el historial de resúmenes y de compras, y los fijos en tarjeta. La arquitectura define los endpoints, pero no la forma de algunas respuestas ni varios detalles de comportamiento.

## Decisiones

**Carga por cuota (TAR-02)**

- `createChargeRequestSchema` acepta exactamente uno de `totalAmount` o `installmentAmount`. Con la cuota, el total es cuota × cantidad (`totalFromInstallment` en `libs/domain`). Al repartirlo, cada cuota vale exactamente esa cuota, sin redondeo. No se guarda nada nuevo.
- Editar un consumo sigue mandando el total. En el formulario, "Por cuota" se convierte a total antes de enviar.
- El modo ("Total" o "Por cuota") se recuerda en el navegador (`localStorage`) solo cuando hay más de una cuota. Con una cuota siempre se usa "Total".
- La moneda de un consumo ya usa `cardCurrencySchema` (ARS o USD), que en la fase 23 sigue igual cuando se amplían las monedas.

**Historial de resúmenes (TAR-12)**

- `GET /cards/:id/statements?status=closed` mantiene la respuesta como lista (igual que sin `status`), para no tener dos formas en el mismo endpoint. Trae los resúmenes que no están abiertos (cerrados, con pago parcial o pagados), del más nuevo al más viejo, de a `limit` (12 por defecto). El cursor es el período del último recibido. La web pide la página siguiente cuando la anterior vino completa.
- En el detalle de la tarjeta, la pestaña "Resumen" pasa a "Resúmenes": arriba el abierto (con lo que hay para pagar y el cierre), debajo los anteriores. Cada uno abre una hoja con sus consumos y cuotas, ajustes y pagos. Tocar un consumo abre su edición, que en un resumen cerrado solo deja cambiar la descripción y la categoría (TAR-11).

**Historial de compras (TAR-13)**

- `GET /charges` responde `{ items, nextCursor }`, con el cursor opaco de movimientos (fecha, creación, id). Filtros: `cardId`, `from`/`to` por fecha de compra, `query` (descripción, sin distinguir mayúsculas) y `status`.
- **Terminada** = ninguna cuota en un resumen abierto (así la última está en uno cerrado). **Activa** = alguna en uno abierto. Un consumo en un pago queda terminado cuando cierra su resumen.
- `installmentAmount` es el de la primera cuota registrada (la última puede diferir en centavos) y `current` sale de la misma regla de TAR-05 ("4 de 12").
- Pantallas: `/app/tarjetas/:id/compras` (desde el detalle) y `/app/tarjetas/compras` (desde Tarjetas, con el nombre de la tarjeta en cada fila). Los consumos que vienen de un fijo llevan la marca "Fijo".

**Fijos en tarjeta (TAR-09)**

- `POST /fixed` acepta exactamente uno de `pocketId` y `cardId`. Con tarjeta, el fijo tiene que ser un gasto y llevar `currency` (ARS o USD). Un fijo no cambia de tipo: uno de apartado no pasa a tarjeta ni al revés (400). Sí puede pasar a otra tarjeta.
- `POST /sync` crea, por cada fijo en tarjeta activo y cada período vencido, un consumo de un pago con el monto vigente de ese período, fechado el día del fijo, en el resumen abierto que le corresponde a esa fecha. Lo hace en la misma transacción del sync. Para que dos syncs simultáneos no lo dupliquen, toma un lock transaccional (`pg_advisory_xact_lock`) por (fijo, período) antes de mirar si ya existe. La restricción única `(fixedId, fixedPeriod)` queda como última defensa. Una tarjeta archivada deja de recibir sus fijos.
- La respuesta de `POST /sync` suma `generatedCharges`.
- Un fijo que ya cargó consumos no se puede borrar (`FIXED_HAS_HISTORY`, igual que con movimientos confirmados): se finaliza.
- En el formulario de fijos, un gasto elige "Apartado o tarjeta" en un mismo selector. Con tarjeta aparece la moneda (ARS o USD). En la fase 23 ese segmentado pasa a `pl-currency-select` con `cardOnly`.

## Consecuencias

- Pendiente: **Compromisos e Inicio todavía no proyectan los fijos en tarjeta de meses futuros.** Siguen filtrando los fijos con apartado, porque sumar los de tarjeta contaría dos veces el mes ya generado (ya es una cuota del resumen). Para incluirlos hay que proyectar solo los períodos posteriores al último generado y ubicarlos por el vencimiento del resumen. Queda para una fase chica.
- No hubo cambios de esquema: `CardCharge.fixedId` y `fixedPeriod` ya existían.
