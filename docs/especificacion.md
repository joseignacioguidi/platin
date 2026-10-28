# Especificación funcional — App de finanzas personales

Oct 23, 2026 · @Jose

## Visión y principios

Una app web personal para saber cuánta plata tengo, dónde está, cuánto ya está comprometida y cuánto me falta para mis metas. Es multiusuario (cada persona con su cuenta y sus datos), responsive y con identidad de producto: landing pública + app de gestión.

Reemplaza a la versión Go + Next.js. Los problemas que viene a resolver:

- **Parches de UX**: cada funcionalidad se agregó como pantalla aparte. Ahora todo gira alrededor de cuentas y movimientos, y lo demás se calcula a partir de ellos.
- **Cuotas engorrosas**: hoy se simulan fijando gastos mes a mes. Ahora las cuotas viven en la tarjeta y generan compromisos futuros solas.
- **Ahorros, metas e inversiones desconectados**: hoy son montos cargados a mano. Ahora una meta se mide contra cuentas reales y dice cuánto falta por mes.
- **Dinero en float**: los montos pasan a decimal exacto.

Principios de diseño:

1. **Un solo origen de verdad**: el saldo de una cuenta se calcula de sus movimientos, nunca se tipea.
2. **Lo futuro se ve**: cuotas, fijos y resúmenes de tarjeta aparecen como compromisos antes de que pasen.
3. **Cargar un gasto en menos de 10 segundos** desde el celular.
4. **Multimoneda nativa**: cada monto guarda su moneda y su tipo de cambio del día.

## Modelo de dominio

Todo dinero vive en un apartado de una **cuenta** o en una **tarjeta**; los movimientos los mueven y todo lo demás (saldos, compromisos, avance de metas) se calcula. Cada entidad pertenece a un usuario.

| Entidad | Qué representa | Campos clave |
| --- | --- | --- |
| Usuario | Persona con su espacio de datos | email, contraseña, moneda base, cotización preferida para valuar (oficial, MEP, blue) |
| Cuenta | La institución o el lugar donde está la plata: Mercado Pago, Santander, Ualá, efectivo, un broker | nombre, tipo (banco, billetera, efectivo, broker), color, archivada |
| Apartado | Plata separada dentro de una cuenta, con su moneda y su propósito: el disponible, una reserva, una inversión | cuenta, nombre, moneda, tipo (disponible, ahorro, inversión), instrumento (solo inversión), saldo inicial, cuenta para patrimonio, archivado |
| Categoría | Clasificación de ingresos y gastos, propia de cada usuario | nombre, tipo (ingreso/gasto), ícono, color, categoría padre opcional, de sistema, archivada |
| Movimiento | Ingreso, gasto, ajuste o rendimiento sobre un apartado | apartado, categoría, monto, moneda, fecha, descripción, estado (pendiente/confirmado), tipo de cambio, monto en moneda base, origen |
| Transferencia | Plata que pasa de un apartado a otro: apartar, invertir, rescatar, mover entre cuentas o comprar dólares | apartado origen, apartado destino, monto que sale, monto que entra, cotización implícita, fecha |
| Tarjeta de crédito | Una tarjeta con su ciclo | nombre, emisor, últimos 4, límite, día de cierre, día de vencimiento, apartado de pago por defecto |
| Resumen | Un ciclo de la tarjeta | tarjeta, período, fecha de cierre, fecha de vencimiento, total ARS, total USD, estado (abierto, cerrado, pagado, pagado parcial) |
| Consumo | Una compra con tarjeta, en 1 o N cuotas | tarjeta, fecha, descripción, categoría, monto total, moneda, cantidad de cuotas, primer resumen |
| Cuota | Una parte del consumo que cae en un resumen | consumo, número (3 de 12), monto, resumen al que pertenece |
| Fijo | Gasto o ingreso que se repite: alquiler, sueldo, suscripciones | tipo, categoría, apartado o tarjeta, monto, moneda, frecuencia, día, desde, hasta opcional |
| Presupuesto | Tope de gasto por categoría | categoría, monto mensual, moneda, vigente desde, vigente hasta opcional |
| Meta | Objetivo de ahorro | nombre, monto objetivo, moneda, fecha objetivo, apartados vinculados |
| Valuación | El valor de un apartado de inversión en una fecha, cargado a mano | apartado, fecha, valor, rendimiento generado |
| Cotización | Tipo de cambio de un día | fecha, par de monedas, tipo (oficial, MEP, blue), valor, fuente |

_Diagrama de relaciones: Fijo genera Movimiento; Movimiento clasifica con una Categoría y afecta el saldo de un Apartado; Meta mide el avance de Apartados; Apartado pertenece a una Cuenta; Transferencia mueve plata entre apartados y paga la Tarjeta; Tarjeta tiene un Resumen por mes; Consumo se divide en Cuotas que caen en Resúmenes._

El apartado es el centro: movimientos, transferencias y metas lo afectan o lo miden, y cada apartado pertenece a una cuenta. Del lado de la tarjeta, cada consumo se parte en cuotas que caen en resúmenes mensuales.

Pagar un resumen es una transferencia de un apartado a la tarjeta; por eso el gasto se registra una sola vez (en el consumo) y el pago no lo duplica. Lo mismo vale para invertir o apartar: es mover plata entre apartados, no un gasto.

## Módulos y casos de uso

Trece módulos; cada caso de uso tiene un código para referenciarlo en el plan de implementación.

### 1. Autenticación y perfil

- **AUTH-01** Registrarse con email y contraseña.
- **AUTH-02** Iniciar y cerrar sesión; la sesión se renueva sola (refresh token).
- **AUTH-03** Recuperar contraseña por email.
- **AUTH-04** Configurar moneda base y cotización preferida para valuar dólares.
- **AUTH-05** Onboarding inicial: crear primeras cuentas, tarjetas y categorías sugeridas.

### 2. Cuentas y apartados

- **CTA-01** Crear, editar y archivar cuentas: una por institución o lugar (Mercado Pago, Santander, efectivo, un broker), con su tipo (banco, billetera, efectivo, broker).
- **CTA-02** Crear apartados dentro de una cuenta con nombre, moneda y tipo: disponible, ahorro o inversión. Toda cuenta nace con un apartado "Disponible" en pesos.
- **CTA-03** Ver cada cuenta con sus apartados agrupados, el saldo de cada uno y el total de la cuenta por moneda; arriba, el total general por moneda.
- **CTA-04** Ver el detalle de un apartado con sus movimientos y la evolución del saldo.
- **CTA-05** Mover plata entre apartados de la misma cuenta en dos toques, con acciones con nombre: Apartar (a un ahorro), Invertir (a una inversión) y Rescatar (de vuelta al disponible).
- **CTA-06** Ajustar el saldo de un apartado: se crea un movimiento de ajuste por la diferencia.
- **CTA-07** Archivar un apartado o una cuenta cuando su saldo es 0; el histórico se conserva.

### 3. Movimientos

- **MOV-01** Cargar ingreso o gasto con cuenta, categoría, monto, fecha y nota. Carga rápida desde un botón siempre visible.
- **MOV-02** Cargar una transferencia entre apartados, de la misma cuenta o de otra, incluida la compra o venta de dólares con su cotización.
- **MOV-03** Listar, filtrar (fecha, cuenta, categoría, tipo, texto) y buscar movimientos.
- **MOV-04** Editar y eliminar movimientos.
- **MOV-05** Confirmar movimientos pendientes generados por fijos, en lote.
- **MOV-06** Exportar movimientos a CSV.

### 4. Tarjetas de crédito

- **TAR-01** Alta de tarjeta con día de cierre, día de vencimiento y límite.
- **TAR-02** Cargar un consumo en 1 o N cuotas; la app reparte las cuotas en los resúmenes que correspondan.
- **TAR-03** Cargar un consumo en cuotas ya empezado ("voy por la 4 de 12"), para migrar compras existentes.
- **TAR-04** Ver el resumen actual (abierto) y los próximos, con el detalle de cuotas y consumos de cada uno.
- **TAR-05** Ver las cuotas activas: qué compra, cuál cuota va, cuántas faltan y cuánto resta pagar.
- **TAR-06** Ajustar fechas de cierre y vencimiento de un resumen puntual (el banco las corre por feriados).
- **TAR-07** Cerrar un resumen y comparar el total calculado contra el del banco; la diferencia se carga como ajuste (intereses, impuestos, sellos).
- **TAR-08** Pagar un resumen total o parcialmente desde una cuenta, en pesos y en dólares por separado.
- **TAR-09** Cargar fijos en la tarjeta (suscripciones) que se suman a cada resumen.
- **TAR-10** Ver el límite disponible: límite menos lo consumido y cuotas pendientes.

* **TAR-11** Editar o borrar un consumo desde el detalle de la tarjeta o desde Movimientos. Si alguna cuota ya está en un resumen cerrado, solo se puede editar la descripción y la categoría.

### 5. Fijos

- **FIJ-01** Crear gasto o ingreso fijo con frecuencia (mensual, anual, cada N meses), día, desde y hasta opcional.
- **FIJ-02** Cambiar el monto desde un mes en adelante (aumento de alquiler) sin tocar el pasado.
- **FIJ-03** Pausar o finalizar un fijo.
- **FIJ-04** Cada período, el fijo genera un movimiento pendiente para confirmar con su monto real.

### 6. Compromisos

- **COM-01** Ver una línea de tiempo de los próximos 12 meses: cuotas, resúmenes a pagar y fijos, por mes y por moneda.
- **COM-02** Ver el total comprometido de un mes y cuánto queda libre según los ingresos esperados.
- **COM-03** Ver cuándo termina cada plan de cuotas y cuánto se libera ese mes.

### 7. Presupuestos

- **PRE-01** Definir un presupuesto mensual por categoría con vigencia desde un mes.
- **PRE-02** Ver gastado contra presupuesto del mes, con alerta al 80 % y al 100 %.
- **PRE-03** Los consumos con tarjeta en 1 pago cuentan en el mes de la compra; en cuotas, cada cuota cuenta en el mes de su resumen.

### 8. Metas de ahorro

- **MET-01** Crear meta con monto objetivo, moneda y fecha (ej.: auto de USD 15.000 para diciembre 2027).
- **MET-02** Vincular cuentas a la meta o asignar aportes desde transferencias.
- **MET-03** Ver lo acumulado, lo que falta, el aporte mensual necesario y si voy adelantado o atrasado.
- **MET-04** Simular: "si aporto X por mes, ¿cuándo llego?".
- **MET-05** Marcar meta como cumplida o cancelada.

### 9. Inversiones (simple)

- **INV-01** Una inversión es un apartado de tipo inversión dentro de una cuenta, con su instrumento (CEDEAR, acción, FCI —incluidos los Superfondos—, plazo fijo, cripto u otro) y su moneda. Si se quieren seguir por separado, cada instrumento tiene su propio apartado.
- **INV-02** Invertir y rescatar son transferencias entre el disponible y el apartado de inversión, sin cargar un gasto.
- **INV-03** Actualizar valores: una pantalla lista todos los apartados de inversión con su último valor y permite cargar el actual de todos en una sola pasada. Pensada para hacerse a principio de mes; el inicio la sugiere si pasó más de un mes desde la última.
- **INV-04** Cada actualización registra un movimiento de rendimiento por la diferencia entre el valor cargado y el saldo calculado, positivo o negativo.
- **INV-05** Ver por apartado y en total: invertido neto, valor actual, rendimiento acumulado y rendimiento del último período, en la moneda de cada uno y valuado en moneda base.

### 10. Dashboard, reportes y landing

- **DAS-01** Dashboard: patrimonio neto, ingresos y gastos del mes, próximo vencimiento de tarjetas, presupuestos en riesgo, avance de metas.
- **DAS-02** Reporte por categoría y por mes, con comparación contra el mes anterior.
- **DAS-03** Evolución del patrimonio en el tiempo.
- **LAN-01** Landing pública con la identidad de platin: propuesta de valor, el producto en acción, funcionalidades y llamado a registrarse. Usa la cara del guiño, la paleta completa y un movimiento principal (ver "Identidad visual y UX > Landing").
- **LAN-02** Páginas de login y registro con la misma identidad visual.

### 11. Categorías

- **CAT-01** Ver las categorías de ingreso y de gasto con su ícono y color. Las sugeridas se crean al registrarse y se editan como cualquier otra: cada usuario tiene las suyas.
- **CAT-02** Crear y editar una categoría: nombre, tipo, ícono (de una lista), color (de la paleta) y categoría padre opcional.
- **CAT-03** Archivar una categoría: deja de ofrecerse al cargar y el histórico se conserva.
- **CAT-04** Fusionar una categoría en otra: pasa todos sus movimientos, consumos, fijos y presupuestos a la otra y la archiva.
- **CAT-05** Las categorías de sistema (Ajustes, Rendimientos) no se pueden editar ni archivar.

### 12. Planes

Los planes existen y limitan el uso, pero todavía no se cobra: el plan lo asigna el administrador. La pasarela de pago se suma después sin cambiar este módulo.

- **PLN-01** El administrador define los planes: nombre, descripción, precio de referencia (solo informativo), límites por recurso (cuentas, apartados, tarjetas, metas, fijos) y funcionalidades habilitadas (por ejemplo, inversiones). Un límite vacío significa ilimitado.
- **PLN-02** Todo usuario nuevo recibe el plan por defecto, configurable por el administrador.
- **PLN-03** El usuario ve su plan y su uso contra cada límite en el perfil, y qué incluye cada plan en una página pública de planes.
- **PLN-04** Al llegar a un límite, la app dice cuál es y ofrece pedir otro plan. La solicitud le llega al administrador.
- **PLN-05** Bajar de plan nunca borra datos: lo que excede el límite se sigue viendo y editando, pero no se pueden crear nuevos.
- **PLN-06** El administrador cambia el plan de un usuario, con vencimiento opcional (por ejemplo, Pro de prueba por 30 días); al vencer, vuelve al plan por defecto.

### 13. Administración

El administrador gestiona la plataforma, no la plata de los usuarios: ve datos de cuenta y métricas agregadas, nunca movimientos, saldos ni montos.

- **ADM-01** Rol de administrador, asignado por configuración del servidor (no se pide ni se otorga desde la app).
- **ADM-02** Panel con métricas agregadas: usuarios totales, activos en 7 y 30 días, altas por semana, usuarios por plan y uso por funcionalidad (cuántos usuarios usan tarjetas, metas, inversiones, fijos).
- **ADM-03** Lista de usuarios con email, nombre, fecha de alta, último acceso, plan y estado; con búsqueda y filtros. Por usuario se ve cuántos registros tiene de cada tipo, no su contenido.
- **ADM-04** Acciones sobre un usuario: cambiar el plan, suspender y reactivar, cerrar sus sesiones y eliminar la cuenta con todos sus datos (con confirmación escribiendo el email).
- **ADM-05** Configuración global: planes y límites, plan por defecto, categorías sugeridas para usuarios nuevos, cotización por defecto, registro abierto o cerrado y un aviso para todos los usuarios con texto y fechas.
- **ADM-06** Solicitudes de cambio de plan: verlas, aprobarlas o rechazarlas.
- **ADM-07** Registro de auditoría de cada acción del administrador: quién, qué, cuándo y sobre qué usuario.

## Reglas de negocio

Estas reglas son las que más errores generan si se dejan implícitas; cada una debe tener tests unitarios.

### Cuentas y apartados

- Cada apartado tiene una sola moneda; una cuenta puede tener apartados en pesos y en dólares.
- Saldo de un apartado = saldo inicial + ingresos confirmados − gastos confirmados ± ajustes ± rendimientos − transferencias que salen + transferencias que entran. Se calcula, no se guarda.
- Saldo de una cuenta = suma de sus apartados, separada por moneda.
- Todo movimiento se carga sobre un apartado. La carga rápida preselecciona el último apartado usado; al elegir una cuenta se usa su Disponible en la moneda del monto.
- Mover entre apartados de la misma moneda pide un monto; entre monedas distintas pide los dos montos y muestra la cotización resultante (comprar dólares dentro de Mercado Pago).
- El tipo del apartado define dónde aparece: Disponible en el uso diario, Ahorro en la pantalla de ahorros, Inversión en ahorros e inversiones. No cambia cómo se calcula el saldo.
- Los fijos y los pagos de tarjeta salen de un apartado; las metas se vinculan a apartados.
- El patrimonio suma los apartados marcados como "cuenta para patrimonio", valuados en moneda base.

### Dinero y monedas

- Montos en `numeric(18,2)` y cotizaciones en `numeric(18,6)`; nunca `float`. En TypeScript se usa una librería decimal; redondeo a 2 decimales, mitad hacia arriba.
- Cada movimiento guarda su moneda, la cotización a moneda base del día y el monto convertido. Ese valor queda congelado: si cambia la cotización, el histórico no se recalcula.
- En una transferencia entre monedas distintas, la cotización la define el usuario (los dos montos) y no la API.
- El patrimonio y los totales actuales se valúan con la cotización del día del tipo que eligió el usuario (oficial, MEP o blue).
- Las cotizaciones se guardan por día; si la API falla, se usa la última disponible y la UI lo indica.

### Ciclo de la tarjeta

- Cada mes tiene un resumen. Su cierre por defecto es el día de cierre de la tarjeta en ese mes (si el mes es más corto, el último día). Su vencimiento es el día de vencimiento siguiente al cierre.
- Las fechas de un resumen se pueden corregir a mano (TAR-06) y la corrección manda sobre el cálculo.
- Un consumo con fecha menor o igual al cierre de un resumen abierto cae en ese resumen; si es posterior, cae en el siguiente.
- Los totales de pesos y dólares de un resumen se llevan por separado y se pagan por separado.
- Al cerrar, el total del banco puede diferir del calculado; la diferencia se registra como ajuste del resumen con su categoría (intereses, impuestos).
- Estados del resumen: abierto, cerrado, pagado parcial, pagado. Un pago menor al total deja el saldo pendiente visible para el resumen siguiente.

### Cuotas

- Un consumo de N cuotas genera N cuotas: la 1 en el resumen que corresponde a la fecha de compra, la i en el resumen siguiente a la i − 1.
- Monto de cada cuota = total / N redondeado a 2 decimales; la diferencia de redondeo va a la última cuota.
- Un consumo cargado como "voy por la k de N" genera solo las cuotas k a N, desde el resumen abierto.
- Editar el consumo regenera las cuotas que todavía no están en un resumen cerrado.
- Cuotas restantes = N menos cuotas en resúmenes cerrados; monto restante = suma de esas cuotas.

### Fijos y movimientos pendientes

- Los pendientes se generan **cuando el usuario abre la app**, para cada período vencido desde la última generación. No depende de un cron: el backend gratuito se duerme y un cron podría no correr.
- Un pendiente no impacta saldos ni presupuestos hasta que se confirma; al confirmar se puede corregir el monto.
- Un cambio de monto aplica desde el período indicado en adelante; los períodos anteriores conservan su monto.

### Compromisos de un mes

Comprometido del mes M = cuotas de resúmenes que vencen en M + fijos de gasto activos en M (con su monto vigente) + fijos en tarjeta que caen en esos resúmenes. Libre del mes = ingresos fijos esperados − comprometido. Todo se muestra separado por moneda y además valuado en moneda base.

### Presupuestos

- Gastado de una categoría en el mes = gastos confirmados de esa categoría y sus subcategorías, en moneda base.
- Consumos con tarjeta: un pago cuenta en el mes de la compra; en cuotas, cada cuota cuenta en el mes de su resumen.
- Un presupuesto rige desde su mes de inicio hasta que se reemplaza o se termina; no se copia mes a mes.

### Metas

- Acumulado = suma de saldos de los apartados vinculados convertidos a la moneda de la meta.
- Meses restantes = meses entre el mes siguiente al actual y el mes objetivo, ambos incluidos (mínimo 1).

```latex
\text{aporte mensual} = \frac{\text{objetivo} - \text{acumulado}}{\text{meses restantes}}
```

- Ejemplo: objetivo USD 15.000 para diciembre 2027, acumulado USD 4.200 en octubre 2026. Faltan USD 10.800 en 14 meses, o sea USD 771,43 por mes.
- Ritmo: el esperado a hoy es el objetivo × meses transcurridos / meses totales desde la creación. Adelantado si el acumulado lo supera, atrasado si no.
- Simulación (MET-04): meses necesarios = faltante / aporte propuesto, redondeado hacia arriba.

### Inversiones

- Un apartado de inversión calcula su saldo igual que cualquier otro: aportes − rescates + rendimientos.
- Actualizar valor con un valor V en la fecha F: rendimiento = V − saldo calculado a F. Se guarda la valuación y un movimiento de tipo rendimiento por esa diferencia, con la categoría de sistema Rendimientos. Después de eso, el saldo del apartado es exactamente V.
- Invertido neto = transferencias que entraron − transferencias que salieron del apartado. Rendimiento acumulado = suma de sus rendimientos; en porcentaje, sobre el invertido neto.
- Los rendimientos no cuentan como ingreso en "Libre este mes" ni en presupuestos; sí suman al patrimonio y aparecen en el detalle del apartado.
- Borrar la última valuación borra su movimiento de rendimiento; las anteriores no se pueden borrar mientras exista una posterior.

### Planes

- Los límites se verifican solo al crear: si el usuario está en el límite o por encima, no puede crear otro de ese recurso, pero puede seguir editando, archivando y borrando lo existente.
- Lo archivado no cuenta para el límite.
- Una funcionalidad deshabilitada oculta su pantalla y sus acciones; los datos que ya existían se conservan y vuelven a verse al habilitarla.
- El plan vigente es el último asignado que no venció; si no hay ninguno, el plan por defecto.

### Administración

- Ningún endpoint de administración devuelve montos, saldos, descripciones, categorías ni nombres de cuentas de un usuario. Las métricas son conteos.
- Un usuario suspendido no puede ingresar y sus sesiones se cierran. Sus datos se conservan.
- Toda acción del administrador que cambia algo queda en la auditoría, en la misma transacción que el cambio.
- El administrador no puede suspenderse ni quitarse el rol a sí mismo.

## Alcance: MVP, backlog y fuera de alcance

El MVP es lo mínimo para dejar de usar la versión actual: cuentas, movimientos, tarjetas con cuotas, fijos, compromisos y metas. Presupuestos, inversiones y reportes completos van en una segunda tanda.

| Módulo | MVP | Segunda tanda |
| --- | --- | --- |
| Autenticación y perfil | AUTH-01, 02, 04 | AUTH-03 recuperar contraseña, AUTH-05 onboarding |
| Cuentas | CTA-01, 02, 03, 04 | — |
| Movimientos | MOV-01 a 05 | MOV-06 exportar CSV |
| Tarjetas | TAR-01 a 05, 07, 08 | TAR-06 corregir fechas, TAR-09 fijos en tarjeta, TAR-10 límite disponible |
| Fijos | FIJ-01 a 04 | — |
| Compromisos | COM-01, 02 | COM-03 liberación de cuotas |
| Presupuestos | — | PRE-01 a 03 |
| Metas | MET-01, 02, 03 | MET-04 simulación, MET-05 |
| Inversiones | — | INV-01 a 03 |
| Dashboard y reportes | DAS-01 (versión simple) | DAS-02, DAS-03 |
| Landing | LAN-01, LAN-02 | — |

Fuera de alcance por ahora:

- Importar extractos bancarios o resúmenes en PDF/CSV.
- Cotización automática de inversiones.
- Cuentas compartidas entre usuarios (pareja, familia).
- App móvil nativa o modo offline; la web es responsive.
- Cobro real de suscripciones: los planes funcionan sin cobrar; la pasarela (Mercado Pago) se suma más adelante.
- Migración de datos desde la versión actual: se cargan a mano.

### Iteración 2 (octubre 2026)

Después de usar el MVP, el modelo de cuentas planas no representaba cómo está organizada la plata: una institución con reservas en pesos y dólares terminaba partida en varias cuentas. Esta iteración agrega:

- Apartados dentro de las cuentas (CTA-01 a 07) e inversiones como apartados con valuación manual (INV-01 a 05).
- Gestión de categorías por usuario (CAT-01 a 05).
- Edición de consumos de tarjeta (TAR-11).
- Selectores y campos de fecha propios en todos los formularios.

La base de datos se recrea desde cero: no se migran los datos cargados durante el MVP.

### Iteración 3 (octubre 2026)

Tres pilares para que platin se parezca más a un producto:

- Una landing con más identidad y movimiento (LAN-01 y la sección "Landing"), a partir de tres direcciones visuales en el canvas de mockups.
- Un usuario administrador con métricas, gestión de usuarios y configuración global (ADM-01 a 07).
- Planes con límites, asignados por el administrador y sin cobro (PLN-01 a 06). El cobro real con Mercado Pago queda fuera de alcance por ahora.

## Identidad visual y UX

La app usa la paleta y la tipografía de Hecho, con los colores reasignados a significados financieros. La interfaz se diseña de cero, mobile-first, alrededor de una pregunta: cuánto puedo gastar este mes.

### Paleta con significado financiero

| Color | Hex | Uso en la app |
| --- | --- | --- |
| Verde hecho | #00B99A | Marca, botón principal, ingresos, meta cumplida, presupuesto sano |
| Tinta | #181818 | Texto y fondo del modo oscuro |
| Blanco | #FFFFFF | Fondo del modo claro |
| Coral | #FE8363 | Gastos, presupuesto excedido, alertas |
| Amarillo | #F9C558 | Pendientes de confirmar, presupuesto al 80 %, vencimiento cercano |
| Azul | #0590CB | Transferencias y cuentas |
| Violeta | #8B7FFF | Tarjetas de crédito y cuotas |
| Celeste | #7DE2F2 | Dólares y metas en ahorro (acento) |
| Gris | #6D6D6D | Texto secundario |
| Rosa | #FFC7C7 | Solo landing e ilustraciones |

Coral pasa de acento a color funcional porque las finanzas necesitan un "negativo" claro. El verde y el coral tienen poco contraste sobre blanco: se usan como fondos, íconos y texto grande; para texto chico se definen variantes más oscuras.

### Tipografía

- **Uncut Sans** para títulos, interfaz y texto.
- **JetBrains Mono** para todos los montos y fechas: los números quedan alineados en columnas y le da a la app un sello propio.

### Propuesta de interfaz

1. **Inicio = "Libre este mes"**: un número grande (ingresos esperados − comprometido − gastado) con una barra que muestra cómo se reparte. Debajo, los próximos 30 días como línea de tiempo: vencimientos de tarjeta, cuotas y fijos.
2. **Carga rápida en 3 toques**: botón + siempre visible que abre una hoja inferior. Primero el teclado numérico con el monto, después las categorías recientes como chips; la cuenta usada la última vez viene preseleccionada. En escritorio, también con Ctrl+K.
3. **Bandeja "Para confirmar"**: los pendientes de fijos aparecen como una lista tipo inbox; se confirman deslizando o en lote.
4. **Tarjetas como tarjetas**: cada una se ve como una tarjeta física en violeta con el resumen abierto, días al cierre y total en pesos y dólares. Dentro, las cuotas activas con una barra "4 de 12".
5. **Metas con anillo de progreso**: acumulado, faltante, aporte mensual necesario en grande y una etiqueta de ritmo (adelantado o atrasado).
6. **Navegación**: en celular, barra inferior con Inicio, Movimientos, + , Tarjetas y Más; en escritorio, barra lateral.
7. **Modo oscuro** sobre Tinta desde el primer día.
8. **Ocultar montos** con un toque (ícono de ojo), para usar la app en público.
9. **Estados vacíos con guía**: cada pantalla sin datos explica qué cargar primero, ya que todo se carga a mano.

Antes de implementar conviene bajar estas pantallas a mockups: Inicio, Carga rápida, Tarjeta con cuotas y Meta.

### Formularios

- **Selectores propios** en lugar de las listas nativas del navegador: con búsqueda, ícono y color de cada opción, y un dato secundario (saldo y moneda de un apartado, tipo de una categoría). Agrupan opciones (apartados por cuenta) y se manejan con teclado. En celular se abren como hoja inferior.
- **Campo de fecha propio**: un calendario que funciona igual en escritorio y celular, con atajos Hoy y Ayer, y la fecha escrita en español ("lunes 27 de octubre").
- Ningún formulario usa `<select>` ni `<input type="date">` nativos.

### Landing

- La cara del guiño es el personaje de la marca: aparece en el hero y en el cierre.
- La landing usa toda la paleta, incluidos los acentos coral, celeste y rosa, que en la app están reservados.
- Un solo movimiento principal al cargar (el guiño, los números que ruedan o los recortes flotando, según la dirección elegida) y nada que se mueva sin motivo. Con "reducir movimiento" activado, todo queda quieto.
- Los montos que se muestran son ejemplos coherentes con los de la app (libre del mes $ 412.300, meta del auto USD 771 por mes).

## Stack, arquitectura y preguntas abiertas

Stack decidido: NestJS + Angular en un monorepo Nx, Postgres en Neon, backend en Render y frontend en Vercel o Cloudflare Pages, todo en planes gratuitos. El detalle de arquitectura va en un documento aparte.

| Capa | Elección | Por qué |
| --- | --- | --- |
| Monorepo | Nx con pnpm | Soporte nativo de Angular y Nest; librería compartida de tipos y DTOs |
| Backend | NestJS, módulos por dominio | Estructura consistente y fácil de seguir para Claude Code |
| ORM y migraciones | Prisma (alternativa: Drizzle) | Migraciones versionadas en lugar de AutoMigrate |
| Auth | JWT de acceso + refresh token, contraseñas con argon2 o bcrypt | Sin dependencia de un proveedor externo |
| Frontend | Angular con standalone components y signals | Preferencia del proyecto; moderno y sin NgModules |
| UI | Tailwind CSS + Angular CDK con componentes propios | Libertad total para la identidad visual; el CDK resuelve accesibilidad, overlays y hojas inferiores |
| Landing | Rutas públicas de la misma app, prerenderizadas | Una sola identidad visual y un solo deploy |
| Base de datos | Postgres en [Neon](https://neon.com/pricing) | Free con 1 GB y sin borrado por inactividad; se suspende tras 5 min sin uso |
| Hosting backend | [Render](https://render.com/docs/free) free | Se duerme tras 15 min; la UI muestra "despertando servidor" |
| Cotizaciones | API gratuita (hoy open.er-api.com) + fuente para MEP y blue | Se guardan por día en la base |

No usar Postgres de Render: las bases gratuitas vencen a los 30 días.

### Preguntas abiertas

- [ ] Presupuestos y cuotas: decidido, cuota a cuota. Cada cuota cuenta en el mes de su resumen.
- [ ] ¿Qué API usar para dólar MEP y blue? Hay que elegir una fuente gratuita y estable.
- [ ] UI: propuesta Tailwind + Angular CDK en lugar de Material o PrimeNG, que pelean con una identidad propia. Confirmar.
- [ ] Nombre y logo del producto: pendientes. Paleta y tipografía: decididas, las de Hecho.
- [ ] Migración: decidido, no se migran datos; se cargan a mano.
