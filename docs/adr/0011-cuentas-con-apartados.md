# 0011 — Cuentas con apartados

Fecha: 2026-10-27 · Fase 10

## Contexto

Las cuentas planas no representaban cómo está organizada la plata: Mercado Pago con reservas en pesos y en dólares terminaba partido en varias cuentas. La iteración 2 cambia el modelo a **cuentas** (la institución) con **apartados** adentro, y recrea la base desde cero.

## Decisiones

**Esquema y migraciones**

- El esquema sigue la sección "Modelo de datos" de la arquitectura: `Account`, `Pocket`, `PocketValuation`, `GoalPocket`; `pocketId` en movimientos, fijos y tarjetas; transferencias entre apartados. Se eliminan `GoalAccount` y `GoalContribution`.
- **Las migraciones anteriores se descartaron** y quedó una única migración inicial (`20261027200000_init`), con las check constraints en SQL:
  - las que ya existían;
  - el instrumento solo en apartados de inversión;
  - una transferencia no puede ir al mismo apartado del que sale;
  - el signo del monto, que ahora también admite `YIELD`.

  Esto deja de lado, por única vez y como pide la arquitectura, la regla de no editar migraciones mergeadas.

- La base local se reseteó con `prisma migrate reset` (con tu confirmación).
- `Budget` todavía no existe: llega con la fase 12.

**Reglas que la especificación no fijaba**

- **Unicidad:** el nombre de una cuenta es único por usuario (`ACCOUNT_EXISTS`); el de un apartado, por cuenta y moneda (`POCKET_EXISTS`). Así se puede tener "Ahorro" en pesos y en dólares.
- **Disponible inicial:** al crear una cuenta se crea su "Disponible" en pesos, y el saldo inicial del formulario va a ese apartado. Para dólares se agrega un apartado.
- **Archivar una cuenta** exige que todos sus apartados estén en cero (`ACCOUNT_NOT_EMPTY`) y archiva sus apartados. Desarchivarla los desarchiva a todos.
- **La intención de una transferencia** (Apartaste, Invertiste, Rescataste, Moviste) no se guarda, porque el esquema no tiene esa columna: se **deduce del tipo de los apartados**.
  - El pedido puede mandar `intent` y la API verifica que encaje (`TRANSFER_INTENT_MISMATCH`). Así las acciones rápidas no pueden apartar en una inversión.
- **Acciones rápidas:** Apartar, Invertir y Rescatar mueven plata entre apartados **de la misma cuenta**, como dice CTA-05. Entre cuentas se usa la transferencia de la carga rápida.
- **Ahorros:** suma los apartados de ahorro e inversión que cuentan para el patrimonio, en cualquier moneda. El efectivo en dólares cuenta si está en un apartado de ahorro.
- **Metas:** el acumulado es la suma de los apartados vinculados. Una meta sin apartados acumula cero; para repartir plata entre metas se crea un apartado por meta.
- **Rendimientos:** un movimiento `YIELD` no se edita ni se borra a mano (`YIELD_FROM_VALUATION`); se deshace borrando su valuación (fase 11).
- **Registro:** al registrarse, el usuario recibe la cuenta "Efectivo" con su Disponible en pesos, además de las categorías.
- **Movimientos:**
  - `GET /movements` filtra por `accountId` (todos los apartados de la cuenta) o por `pocketId`.
  - `GET /pockets/:id/transactions` devuelve esa misma lista para un apartado, con 404 si no es del usuario.
- **Carga rápida:** preselecciona el último apartado usado o, si no hay, el primer Disponible.
- **Evolución del saldo** de un apartado: los saldos a fin de cada mes se calculan en el cliente, recorriendo los movimientos cargados hacia atrás. Si la lista no está completa, se omiten los meses que no se pueden calcular con certeza.

## Reset de Neon y deploy

Los datos de producción se pierden y se vuelven a cargar con la estructura nueva.

1. **En Neon:** borrar la base (Branches → la de producción → Reset, o borrar y crear la base `neondb`). Otra opción es correr `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` desde el SQL Editor.
2. **Mergear a `main`.** Render redeploya y su comando de arranque corre `prisma migrate deploy`, que aplica la migración inicial sobre la base vacía.
3. **Si Render arrancó antes del reset**, se puede aplicar a mano con `DIRECT_URL=<la directa de Neon> pnpm nx run api:prisma-deploy`.
4. **Volver a registrarse** en la app: el usuario nuevo arranca con "Efectivo" y las categorías.

## Consecuencias

- Todo lo que antes apuntaba a una cuenta ahora apunta a un apartado; los contratos cambiaron de nombre (`pocketId`, `fromPocketId`, `defaultPaymentPocketId`, `pocketIds`).
- `PocketValuation` y los tipos `YIELD` / `VALUATION` ya están en el esquema, listos para la fase 11.
