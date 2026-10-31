# 0018 — Plan visible, accesos del inicio y categorías sin salir

Fecha: 2026-10-31 · Fase 21 (PLN-07, DAS-04, CAT-06)

## Contexto

La fase 21 pide marcar lo que el plan no incluye antes de tocarlo, accesos del inicio personalizables y crear categorías desde cualquier selector. Varias piezas no estaban definidas al detalle en la especificación ni en la arquitectura.

## Decisiones

**Plan visible (PLN-07)**

- `pl-plan-badge` vive en `libs/web-ui` porque es solo visual. La directiva `plPlanGate` y `pl-usage` viven en `apps/web/src/app/features/plans/` porque leen el `PlanStore` (y `web-ui` no puede importar de la app).
- La marca lleva el nombre del **primer plan público, en el orden de la lista, que lo permitiría** (para un límite: el que deja crear uno más con el uso actual). Si no hay ninguno, o los planes todavía no cargaron, dice "Pro".
- Mientras el plan no carga, todo se ve habilitado: la API sigue teniendo la última palabra y el interceptor de errores de plan queda como respaldo.
- La directiva intercepta el click en fase de captura, así no corre ni el `(click)` del elemento ni el `routerLink`. Si el elemento tiene `aria-label`, la marca se asocia con `aria-describedby` para que el lector de pantalla la anuncie.
- "Inversiones" en el menú "Más" ya no se oculta con el plan Gratis: se muestra con su marca (antes desaparecía).
- Lo marcado, además de lo que pide el plan: crear cuenta (cuenta y apartado, porque crea su Disponible), apartado, tarjeta, meta y fijo, con su uso al lado del botón; la opción "Inversión" del formulario de apartado (un apartado de inversión existente conserva su tipo); "Invertir" en la cuenta y en el apartado; "Inversiones" en Ahorros, en "Más" y en los accesos. También lo que vuelve a contar para el límite (PLN-05): desarchivar una cuenta o un apartado, reanudar un fijo y reactivar una meta.
- "+ Apartado de inversión" no existía. Se agregó, junto con "+ Apartado de ahorro", debajo de los apartados de Ahorros, y en el estado vacío de Inversiones (reemplaza a "Ir a Cuentas"). Abren el formulario de apartado con el tipo elegido; como no hay una cuenta de contexto, el formulario pide la cuenta.

**Accesos del inicio (DAS-04)**

- `User.preferences` (`Json`, por defecto `{}`) con una migración normal. `PATCH /users/me` acepta `preferences` y **mezcla por clave**: solo cambian las claves enviadas, con la fila bloqueada (`FOR UPDATE`) para que dos dispositivos no se pisen.
- `preferences` es estricto: una clave desconocida responde 400. Si lo guardado deja de validar (por ejemplo, se quita un acceso de la lista), se lee como `{}` y se usan los accesos por defecto.
- Accesos posibles: los siete de la especificación (Cuentas, Tarjetas, Fijos, Compromisos, Ahorros, Inversiones, Categorías), que son el conjunto por defecto, más Movimientos, Para confirmar y Perfil. Así el máximo de 8 tiene sentido. Presupuestos se suma cuando exista.
- Una lista vacía es una elección válida: el inicio muestra un texto que invita a editar.
- El modo edición tiene botones subir y bajar en todos los tamaños (también sirven con teclado) y, en escritorio, una manija para arrastrar con el `DragDrop` del CDK (ya era dependencia).

**Categorías sin salir (CAT-06)**

- `pl-select` suma `createLabel` y el evento `create`, con el texto de la búsqueda. La acción siempre queda al final, aunque se busque algo que no existe.
- `pl-category-select` con `allowCreate` usa el token `PL_CATEGORY_CREATOR` de `web-ui`; la app lo provee con `CategoryCreator`, que abre el formulario de categoría (cargado a demanda) en una hoja encima y devuelve la creada. Desde un selector, el tipo de la categoría queda fijo (el del selector).
- La categoría creada se muestra elegida aunque la lista todavía no se haya recargado.
- En la carga rápida se mantienen los chips de recientes y el selector reemplaza a "Más…".

## Consecuencias

- `User` en los contratos suma `preferences`; los tests de auth y usuarios lo esperan.
- Migración nueva: `20261031003536_user_preferences`.
