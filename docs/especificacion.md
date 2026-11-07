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
| Usuario | Persona con su espacio de datos | email, contraseña, moneda base, monedas que usa, cotización preferida para valuar dólares (oficial, MEP, blue), accesos del inicio |
| Cuenta | La institución o el lugar donde está la plata: Mercado Pago, Santander, Ualá, efectivo, un broker | nombre, tipo (banco, billetera, efectivo, broker), color, archivada |
| Apartado | Plata dentro de una cuenta, con su moneda y su propósito. El disponible es el **saldo de la cuenta**; los demás se llaman **reservas** en la interfaz (ver "Cuentas y reservas") | cuenta, nombre, moneda, tipo (disponible, para gastar, ahorro, inversión), instrumento (solo inversión), saldo inicial, cuenta para patrimonio, archivado |
| Categoría | Clasificación de ingresos y gastos, propia de cada usuario | nombre, tipo (ingreso/gasto), ícono, color, categoría padre opcional, de sistema, archivada |
| Movimiento | Ingreso, gasto, ajuste o rendimiento sobre un apartado | apartado, categoría, monto, moneda, fecha, descripción, estado (pendiente/confirmado), tipo de cambio, monto en moneda base, origen |
| Transferencia | Plata que pasa de un apartado a otro: apartar, invertir, rescatar, mover entre cuentas o comprar dólares | apartado origen, apartado destino, monto que sale, monto que entra, cotización implícita, fecha |
| Tarjeta de crédito | Una tarjeta con su ciclo | nombre, emisor, últimos 4, límite, día de cierre, día de vencimiento, apartado de pago por defecto |
| Resumen | Un ciclo de la tarjeta | tarjeta, período, fecha de cierre, fecha de vencimiento, total ARS, total USD, estado (abierto, cerrado, pagado, pagado parcial) |
| Consumo | Una compra con tarjeta, en 1 o N cuotas | tarjeta, fecha, descripción, categoría, monto total, moneda, cantidad de cuotas, primer resumen |
| Cuota | Una parte del consumo que cae en un resumen | consumo, número (3 de 12), monto, resumen al que pertenece |
| Fijo | Gasto o ingreso que se repite: alquiler, sueldo, suscripciones | tipo, categoría, cuenta o tarjeta, monto, moneda, frecuencia, día, desde, hasta opcional |
| Presupuesto | Tope de gasto por categoría | categoría, monto mensual, moneda, vigente desde, vigente hasta opcional |
| Meta | Objetivo de ahorro | nombre, monto objetivo, moneda, fecha objetivo, apartados vinculados |
| Valuación | El valor de un apartado de inversión en una fecha, cargado a mano | apartado, fecha, valor, rendimiento generado |
| Cotización | Tipo de cambio de un día | fecha, par de monedas, tipo (oficial, MEP, blue), valor, fuente |

_Diagrama de relaciones: Fijo genera Movimiento; Movimiento clasifica con una Categoría y afecta el saldo de un Apartado; Meta mide el avance de Apartados; Apartado pertenece a una Cuenta; Transferencia mueve plata entre apartados y paga la Tarjeta; Tarjeta tiene un Resumen por mes; Consumo se divide en Cuotas que caen en Resúmenes._

El apartado es el centro: movimientos, transferencias y metas lo afectan o lo miden, y cada apartado pertenece a una cuenta.

> **Nombres desde la iteración 6.** "Apartado" (`Pocket`) sigue siendo el nombre técnico en el código y en estos documentos. En la interfaz no aparece: el apartado Disponible se muestra como **el saldo de la cuenta** y los demás como **reservas**. Ingresos, gastos, fijos y pagos de tarjeta van siempre al saldo de la cuenta; a una reserva la plata solo entra y sale por transferencias, más los ajustes de saldo y las valuaciones. Del lado de la tarjeta, cada consumo se parte en cuotas que caen en resúmenes mensuales.

Pagar un resumen es una transferencia de un apartado a la tarjeta; por eso el gasto se registra una sola vez (en el consumo) y el pago no lo duplica. Lo mismo vale para invertir o apartar: es mover plata entre apartados, no un gasto.

## Módulos y casos de uso

Catorce módulos; cada caso de uso tiene un código para referenciarlo en el plan de implementación.

### 1. Autenticación y perfil

- **AUTH-01** Registrarse con email y contraseña.
- **AUTH-02** Iniciar y cerrar sesión; la sesión se renueva sola (refresh token).
- **AUTH-03** Recuperar contraseña por email.
- **AUTH-04** Configurar moneda base y cotización preferida para valuar dólares.
- **AUTH-05** Onboarding inicial: crear primeras cuentas, tarjetas y categorías sugeridas.

* **AUTH-06** Registrarse e ingresar con una cuenta externa. Por ahora, Google; la estructura admite sumar Facebook y Apple sin cambiar el resto de la app. Los botones de proveedores aparecen solo si están habilitados en el servidor.
* **AUTH-07** Ver en el perfil las formas de ingreso de la cuenta (contraseña y proveedores), vincular un proveedor nuevo y desvincular uno, siempre que quede al menos una forma de ingresar.
* **AUTH-08** Una cuenta creada con un proveedor puede definir una contraseña después, para tener una segunda forma de ingresar.
* **AUTH-09** Empezar de cero: desde el perfil, borrar todos los datos financieros propios y quedar como un usuario recién registrado, conservando la cuenta de platin, sus formas de ingreso, el plan y las preferencias. Una casilla "Mantener mis categorías", marcada por defecto, decide si se conservan las categorías.
* **AUTH-10** **Perfil y ajustes** (iteración 10), igual a `docs/mockups/perfil/`. Agrupa en tarjetas:
  1. **Vos**: nombre y email como texto, con un lápiz para editar el nombre en el mismo lugar ("Guardar" y "Cancelar"). El email no se edita.
  2. **Monedas y cotización**: moneda base, cotización para valuar dólares y con qué monedas trabajás. Todo se guarda al tocarlo, sin botón.
  3. **Personalización**: Categorías (cuántas de gastos y de ingresos) y Reglas, cada una abre su pantalla.
  4. **Telegram** (BOT-01 a 06): estado del vínculo con "Cambiar de Telegram" y "Desvincular" en la misma fila, y los mensajes no entendidos.
  5. **Tu plan** (PLN-03) en un renglón: nombre del plan, "Cambiar de plan" y una frase con el uso ("Usás 4 cuentas, 13 reservas…"; con límites, "3 de 5 cuentas").
  6. **Ingreso y seguridad** (AUTH-07, AUTH-08): Google y Contraseña, cada una en una fila; "Definir" abre el campo de la contraseña. Al final, "Cerrar sesión".
  7. **Zona peligrosa** (AUTH-09), separada y al final.

  En escritorio, la tarjeta del nombre a todo el ancho y debajo dos columnas: Monedas y cotización, Personalización y Telegram a la izquierda; plan, ingreso y seguridad y zona peligrosa a la derecha. En celular, una columna con el título de cada grupo fuera de su tarjeta. El modo oscuro no está en el perfil: es un botón de ícono al pie de la barra lateral y un interruptor en "Más".

### 2. Cuentas y apartados

- **CTA-01** Crear, editar y archivar cuentas: una por institución o lugar (Mercado Pago, Santander, efectivo, un broker), con su tipo (banco, billetera, efectivo, broker).
- **CTA-02** Crear reservas dentro de una cuenta con nombre, moneda, saldo de hoy y uso: **para gastar** (un sobre para gastos del mes o para pagar la tarjeta), **ahorro** o **inversión**. Toda cuenta nace con su saldo en pesos; agregar una moneda a la cuenta crea su saldo en esa moneda. El saldo inicial de una reserva se pide solo al crearla, para cargar las que ya existen en el banco.
- **CTA-03** Ver cada cuenta con su saldo y, debajo, sus reservas con el saldo y el uso de cada una, y el total de la cuenta por moneda; arriba, el total general por moneda.
- **CTA-04** Ver el detalle de una cuenta o de una reserva con sus movimientos y la evolución del saldo.
- **CTA-05** En el detalle de una reserva, **Retirar** devuelve plata al saldo de una cuenta (la suya, por defecto). No hay botones Apartar, Invertir ni Rescatar: la intención de la transferencia se deduce del uso de la reserva.
- **CTA-06** En el detalle de una reserva, **Ajustar saldo** abre dos opciones:
  - **Ingresar desde una cuenta**: transferencia desde el saldo de cualquier cuenta (la suya, por defecto), con dos montos si las monedas son distintas.
  - **Ajustar saldo** (en una inversión, **Actualizar valor**): "Usalo para sumar intereses o corregir una diferencia con tu banco." Crea un movimiento de ajuste por la diferencia; en una inversión, una valuación (INV-03, 04).
  - El saldo de una cuenta también se puede ajustar, solo con la segunda opción: "Corregí una diferencia con tu banco o billetera."
- **CTA-07** Archivar un apartado o una cuenta cuando su saldo es 0; el histórico se conserva.

### 3. Movimientos

- **MOV-01** Cargar ingreso o gasto con cuenta, categoría, monto, fecha y motivo. Carga rápida desde un botón siempre visible. Se elige la cuenta (en la moneda del monto), nunca una reserva.
- **MOV-02** Cargar una transferencia entre cuentas, incluida la compra o venta de dólares con su cotización. Lo que entra y sale de las reservas se hace desde la reserva (CTA-05, 06).
- **MOV-03** Listar, filtrar (fecha, cuenta, categoría, tipo, texto) y buscar movimientos.
- **MOV-04** Editar y eliminar movimientos. Al editar se puede cambiar la cuenta, solo por otra con saldo en la misma moneda; para cambiar de moneda hay que borrarlo y cargarlo de nuevo. Al editar un movimiento programado el botón dice "Guardar".
- **MOV-05** Confirmar movimientos pendientes generados por fijos, en lote.
- **MOV-06** Exportar movimientos a CSV.
- **MOV-07** Invertir o rescatar desde la carga rápida: un cuarto modo "Invertir", con "Invertir" / "Rescatar". Invertir pasa plata del saldo de una cuenta a una reserva de inversión, existente o nueva ("+ Nueva inversión"); Rescatar hace lo inverso. Es el único lugar fuera de la reserva donde se invierte. Si las monedas son distintas pide los dos montos. Se guarda como transferencia con intención `INVEST` o `REDEEM` y en la lista se lee "Invertiste $ 150.000 en CEDEARs". Requiere el plan que incluye inversiones.
- **MOV-08** Cargar un gasto o ingreso con fecha futura (un turno médico el 20 con su costo): queda programado, no toca saldos y aparece en compromisos y en los próximos 30 días. Cuando llega su fecha pasa a "Para confirmar".
- **MOV-09** La carga rápida entra en la pantalla de un celular sin scroll (360 × 640 como mínimo), también con tarjeta y cuotas. El **motivo** ("¿En qué?") está siempre visible debajo del monto; si queda vacío, el movimiento toma el nombre de la categoría. Desde la iteración 7, la categoría se elige con el mismo selector que el resto de los formularios (búsqueda, ícono y color, recientes primero y "+ Nueva categoría"), en lugar de la fila de chips.

### 4. Tarjetas de crédito

- **TAR-01** Alta de tarjeta con día de cierre, día de vencimiento y límite.
- **TAR-02** Cargar un consumo en 1 o N cuotas, indicando el monto total o el valor de cada cuota (como figura en el resumen del banco); la app reparte las cuotas en los resúmenes que correspondan y muestra el otro valor calculado. Desde la iteración 9, la cantidad se elige con tres opciones en una fila: las dos que más usás en esa tarjeta y "Otra", que abre un campo para escribir de 1 a 60 (regla "Cuotas más usadas"). Vale en la carga rápida y en el formulario de consumo, en celular y en escritorio, sin scroll.
- **TAR-03** Cargar un consumo en cuotas ya empezado ("voy por la 4 de 12"), para migrar compras existentes. Si el banco ya cerró el resumen anterior y todavía no venció, se elige en qué resumen está esa cuota: en el abierto o en el que cerró y falta pagar.
- **TAR-04** Ver el resumen actual (abierto) y los próximos, con el detalle de cuotas y consumos de cada uno.
- **TAR-05** Ver las cuotas activas: qué compra, cuál cuota va, cuántas faltan y cuánto resta pagar. Desde la iteración 9, en la pestaña Cuotas de una tarjeta:
  - El gráfico "Cuotas por resumen" muestra 6 resúmenes por vez, con flechas para ir a los anteriores (hasta el primero con cuotas) y a los siguientes (hasta el último con cuotas). Cada barra es un botón.
  - El resumen elegido se ve resaltado y **la lista de abajo muestra las cuotas de ese resumen**: compra, "cuota 4 de 12", el monto de ese mes, la barra de avance hasta ese mes y "restan $ X después de diciembre". En un resumen pagado, la marca "Pagado".
  - Arriba de la lista: "Diciembre · $ 65.951,73 en 3 cuotas" y, si en ese resumen termina algún plan, "libera $ 49.634 desde enero" (COM-03).
  - Al entrar, está elegido el próximo resumen a pagar. Un resumen sin cuotas dice "No hay cuotas en este resumen." Las compras en 1 pago también entran en el gráfico, en el total y en la lista ("1 pago"); lo que "libera" cuenta solo planes de 2 cuotas o más.
- **TAR-06** Ajustar fechas de cierre y vencimiento de un resumen puntual (el banco las corre por feriados).
- **TAR-07** Cerrar un resumen y comparar el total calculado contra el del banco; la diferencia se carga como ajuste (intereses, impuestos, sellos).
- **TAR-08** Pagar un resumen total o parcialmente desde una cuenta, en pesos y en dólares por separado. Un pago no puede superar lo pendiente de esa moneda.
- **TAR-09** Cargar fijos en la tarjeta (suscripciones, planes): cada período se cargan solos como un consumo de un pago, en pesos o en dólares, en el resumen que corresponde a su día.
- **TAR-10** Ver el límite disponible: límite menos lo consumido y cuotas pendientes.

* **TAR-11** Editar o borrar un consumo desde el detalle de la tarjeta o desde Movimientos. Si alguna cuota ya está en un resumen cerrado, solo se puede editar la descripción y la categoría.

- **TAR-12** Ver el historial de resúmenes de una tarjeta: todos los anteriores con período, cierre, vencimiento, totales en pesos y dólares, pagos y estado; al entrar a uno, sus consumos, cuotas, ajustes y pagos.
- **TAR-13** Ver el historial de compras: todos los consumos de una tarjeta (o de todas), con búsqueda y filtro por fecha, mostrando el total, la cuota, en qué cuota va ("4 de 12") y si ya terminó.

### 5. Fijos

- **FIJ-01** Crear gasto o ingreso fijo con frecuencia (mensual, anual, cada N meses), día, desde y hasta opcional.
- **FIJ-02** Cambiar el monto desde un mes en adelante (aumento de alquiler) sin tocar el pasado.
- **FIJ-03** Pausar o finalizar un fijo.
- **FIJ-04** Cada período, el fijo genera un movimiento pendiente para confirmar con su monto real.

### 6. Compromisos

- **COM-01** Ver una línea de tiempo de los próximos 12 meses: cuotas, resúmenes a pagar y fijos, por mes y por moneda.
- **COM-02** Ver el total comprometido de un mes y el **margen** del mes (ingresos esperados − comprometido). Incluye los fijos en tarjeta y los gastos programados (MOV-08). Se llama margen y no libre para no confundirlo con "Libre este mes" del inicio, que parte de los saldos.
- **COM-03** Ver cuándo termina cada plan de cuotas y cuánto se libera ese mes.
- **COM-04** Cada línea de Compromisos muestra desde qué cuenta se paga: un resumen, desde la cuenta de pago de su tarjeta; un fijo o un programado, desde su cuenta. Si una tarjeta no tiene cuenta de pago, "Sin cuenta asignada" con un atajo para elegirla. Las líneas no llevan ícono.
- **COM-05** Compromisos tiene tres pestañas (iteración 10), igual a `docs/mockups/navegacion/`:
  - **Próximos meses** (COM-01 a 04). En celular, como hoy: cada mes se despliega. En escritorio, la lista de meses a la izquierda y el detalle del mes elegido a la derecha, con ingresos esperados, comprometido y margen arriba, y cada línea con su desglose de cuotas. Si no hay ingresos fijos, una línea avisa que el margen no cuenta el sueldo y lleva a cargarlo. Arriba, si hay pendientes, el aviso "N fijos esperan que los confirmes".
  - **Fijos** (FIJ-01 a 04): lo mismo que la pantalla de hoy; en escritorio, gastos fijos e ingresos fijos en dos columnas. "+ Nuevo fijo" va en esta pestaña.
  - **Para confirmar** (MOV-05): lo mismo que la pantalla de hoy; en escritorio, una fila por pendiente con casilla, monto real y "Confirmar", y "Confirmar N movimientos" abajo a la derecha.
  - La pestaña Para confirmar y el ítem Compromisos de la navegación muestran cuántos hay para confirmar.

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
- **INV-06** **Ahorros e inversiones** es una sola sección con dos pestañas (iteración 10), igual a `docs/mockups/navegacion/`:
  - **Metas y ahorros**: total ahorrado (incluye lo invertido) con su reparto en pesos y dólares; al lado, una tarjeta "De eso, invertido" con el valor actual y el rendimiento, que lleva a la otra pestaña; debajo, las metas y las **reservas de ahorro** (sin las de inversión).
  - **Inversiones** (INV-03 a 05): valor actual y composición, "Valores cargados a mano" con "Actualizar valores", y las posiciones agrupadas por cuenta; en escritorio, dos cuentas por fila.
  - La pestaña Inversiones conserva la marca de plan: fuera del plan, abre la hoja del plan como hoy.

### 10. Dashboard, reportes y landing

- **DAS-01** Dashboard: patrimonio neto, ingresos y gastos del mes, próximo vencimiento de tarjetas, presupuestos en riesgo, avance de metas.
- **DAS-02** Reporte por categoría y por mes, con comparación contra el mes anterior.
- **DAS-03** Evolución del patrimonio en el tiempo.
- **LAN-01** Landing pública con la identidad de platin: propuesta de valor, el producto en acción, funcionalidades y llamado a registrarse. Usa la cara del guiño, la paleta completa y un movimiento principal (ver "Identidad visual y UX > Landing").
- **LAN-02** Páginas de login y registro con la misma identidad visual.

* **DAS-04** Accesos rápidos en el inicio a las demás funciones (cuentas, tarjetas, fijos, compromisos, ahorros, inversiones, categorías, presupuestos cuando existan). Cada usuario elige cuáles ver y en qué orden; hay un conjunto por defecto.
* **DAS-05** "Libre este mes" se calcula desde los saldos (regla "Libre este mes"). Desde la iteración 11, la tarjeta cuenta el mes de punta a punta (regla "Cómo se llega al libre"):
  - La barra mide todo lo que tuviste para el mes (lo que tenías al empezar más los ingresos) y se reparte en ya pagaste, reservaste, para pagar este mes y libre.
  - Si el libre es negativo, la barra se pasa de largo: lo que sobra se dibuja a rayas en rojo, después de una marca donde terminaba lo que tenías, con "Te pasaste $ X".
  - Filas: "Tenías al empezar el mes" (solo si no es 0), "Ingresos del mes" ›, "Ya pagaste", "Reservaste", "Para pagar este mes" ›, "Otros" (solo si no es 0) y "Libre" ›.
  - "Ingresos del mes" abre los ingresos cobrados y los que faltan cobrar, con fecha, cuenta y monto.
  - "Libre" abre el **resumen del mes**: de dónde vino la plata y a dónde fue, con lo pagado por categoría y por tarjeta y lo reservado por reserva.
* **DAS-07** Inicio práctico (iteración 7), igual a `docs/mockups/inicio-v2/`. En celular, una columna en este orden:
  1. **Lo que te queda**: "Te quedan para gastar este mes", el libre, y "≈ $ X por día hasta el 30/11". La barra muestra en qué se reparte lo que hay: para pagar este mes y libre, cada parte con su nombre y monto. "Para pagar este mes" se abre y lista lo que hay que pagar, con su cuenta de pago.
  2. **Avisos**, una línea cada uno y solo si aplican: movimientos para confirmar, cotización desactualizada, valores de inversión para actualizar.
  3. **Últimos movimientos**: los 5 más recientes; tocar uno abre su edición; "Ver todos".
  4. **Accesos** (DAS-04) en una grilla de 4, sin tarjetas ni colores: cada uno es un ícono de línea en tinta dentro de un círculo de borde fino, con el nombre debajo, sobre el fondo de la pantalla.
  5. **Tus cuentas y sus pagos**, en una sola tarjeta con una sección por cuenta separada por una línea: lo que tiene para gastar, cuánto paga este mes y si le alcanza, y sus próximos 3 pagos del mes. Al pie de la tarjeta, "Ver los N pagos de noviembre".
  6. **Ahorros y metas**: cada meta activa con lo ahorrado, su avance y su ritmo.

  Desde la iteración 11, "El mes hasta hoy" sale del inicio: lo que mostraba está en la tarjeta del libre y en el resumen del mes.

  En escritorio, con la barra lateral, en dos filas: arriba la tarjeta de lo que te queda (dos tercios) y al lado los avisos y los accesos; abajo tres columnas: últimos movimientos (8), cuentas y sus pagos, y ahorros y metas. A menos ancho las columnas se apilan.
* **DAS-06** Todos los gráficos muestran el valor exacto y su etiqueta (mes, categoría, apartado) al pasar el mouse, al enfocar con teclado o al tocar.
* **NAV-01** **Barra lateral de escritorio** (iteración 10): "+ Cargar movimiento" y seis secciones, Inicio, Movimientos, Cuentas, Tarjetas, Compromisos (con el contador de pendientes) y Ahorros e inversiones. Al pie, separados por una línea: Administración (solo administradores), el nombre del usuario con "Perfil y ajustes" debajo, y dos botones de ícono, ocultar montos y modo oscuro.
* **NAV-02** **"Más" en celular**: arriba, la fila del perfil (avatar, nombre y "Perfil y ajustes · categorías · plan"); después Cuentas, Compromisos (con el contador) y Ahorros e inversiones, cada una con una línea de qué tiene; después los interruptores de ocultar montos y modo oscuro; al final, Administración. La barra inferior no cambia.
* **NAV-03** Las rutas viejas de Fijos, Para confirmar e Inversiones llevan a su pestaña, así los enlaces guardados, los accesos del inicio y los avisos siguen funcionando.

### 11. Categorías

- **CAT-01** Ver las categorías de ingreso y de gasto con su ícono y color. Las sugeridas se crean al registrarse y se editan como cualquier otra: cada usuario tiene las suyas.
- **CAT-02** Crear y editar una categoría: nombre, tipo, ícono (de una lista), color (de la paleta) y categoría padre opcional.
- **CAT-03** Archivar una categoría: deja de ofrecerse al cargar y el histórico se conserva.
- **CAT-04** Fusionar una categoría en otra: pasa todos sus movimientos, consumos, fijos y presupuestos a la otra y la archiva.
- **CAT-05** Las categorías de sistema (Ajustes, Rendimientos) no se pueden editar ni archivar.

* **CAT-06** Crear una categoría sin salir de lo que se está cargando: todo selector de categoría termina con "+ Nueva categoría", que abre el formulario encima; al guardar, la categoría nueva queda elegida y lo cargado no se pierde. En la carga rápida, los chips de recientes se mantienen y el selector reemplaza a "Ver todas".

### 12. Planes

Los planes existen y limitan el uso, pero todavía no se cobra: el plan lo asigna el administrador. La pasarela de pago se suma después sin cambiar este módulo.

- **PLN-01** El administrador define los planes: nombre, descripción, precio de referencia (solo informativo), límites por recurso (cuentas, apartados, tarjetas, metas, fijos) y funcionalidades habilitadas (por ejemplo, inversiones). Un límite vacío significa ilimitado.
- **PLN-02** Todo usuario nuevo recibe el plan por defecto, configurable por el administrador.
- **PLN-03** El usuario ve su plan y su uso contra cada límite en el perfil, y qué incluye cada plan en una página pública de planes.
- **PLN-04** Al llegar a un límite, la app dice cuál es y ofrece pedir otro plan. La solicitud le llega al administrador.
- **PLN-05** Bajar de plan nunca borra datos: lo que excede el límite se sigue viendo y editando, pero no se pueden crear nuevos ni volver a activar lo archivado.
- **PLN-06** El administrador cambia el plan de un usuario, con vencimiento opcional (por ejemplo, Pro de prueba por 30 días); al vencer, vuelve al plan por defecto.

* **PLN-07** Lo que el plan no incluye se ve marcado **antes** de tocarlo: los botones, opciones y accesos de una funcionalidad fuera del plan llevan la marca del plan que la incluye (por ejemplo, "Pro"), y donde hay un límite se muestra el uso ("2 de 2 cuentas"). Al tocar algo marcado se abre la explicación del plan con la opción de pedirlo, sin empezar el formulario.

### 13. Administración

El administrador gestiona la plataforma, no la plata de los usuarios: ve datos de cuenta y métricas agregadas, nunca movimientos, saldos ni montos.

- **ADM-01** Rol de administrador, asignado por configuración del servidor (no se pide ni se otorga desde la app).
- **ADM-02** Panel con métricas agregadas: usuarios totales, activos en 7 y 30 días, altas por semana, usuarios por plan y uso por funcionalidad (cuántos usuarios usan tarjetas, metas, inversiones, fijos y el bot de Telegram). Del bot, además: mensajes por semana y porcentaje de mensajes que el parser no entendió. Solo conteos.
- **ADM-03** Lista de usuarios con email, nombre, fecha de alta, último acceso, plan y estado; con búsqueda y filtros. Por usuario se ve cuántos registros tiene de cada tipo, no su contenido.
- **ADM-04** Acciones sobre un usuario: cambiar el plan, suspender y reactivar, cerrar sus sesiones y eliminar la cuenta con todos sus datos (con confirmación escribiendo el email).
- **ADM-05** Configuración global: planes y límites, plan por defecto, categorías sugeridas para usuarios nuevos, reglas de comercio globales (TXT-04), cotización por defecto, registro abierto o cerrado y un aviso para todos los usuarios con texto y fechas.
- **ADM-06** Solicitudes de cambio de plan: verlas, aprobarlas o rechazarlas.
- **ADM-07** Registro de auditoría de cada acción del administrador: quién, qué, cuándo y sobre qué usuario.

### 14. Monedas

Además de pesos y dólares, el usuario puede manejar euros, reales, pesos chilenos y pesos uruguayos, con cotización automática.

- **MON-01** Elegir en el perfil qué monedas usa. Pesos y dólares vienen activados; la moneda base siempre está activada. Solo las monedas activadas aparecen al cargar.
- **MON-02** Crear apartados, cargar movimientos, transferencias (incluida la compra y venta entre monedas), fijos de apartado, metas e inversiones en cualquier moneda activada.
- **MON-03** Ver saldos y totales por cada moneda, y el total general valuado en la moneda base.
- **MON-04** Desactivar una moneda solo si ningún apartado activo, fijo activo ni meta activa la usa; el histórico se conserva.
- **MON-05** Las tarjetas siguen siendo solo en pesos y dólares, como los resúmenes de los bancos: un consumo en otra moneda se carga en el monto que figura en el resumen.

### 15. Carga por texto y Telegram

Cargar un movimiento escribiendo una línea corta ("super 45k visa 3c", "turno médico 15000 el 20 que viene"), en la app o mandándole un mensaje a un bot de Telegram. Nada toca saldos hasta que la persona confirma, y la confirmación usa los mismos servicios que la carga rápida.

- **TXT-01** En la carga rápida de la web, el modo **"Escribir"** reemplaza el teclado numérico por un campo de texto. Al apretar Enter o "Listo", la app interpreta la línea (regla "Carga por texto") y completa el formulario: tipo, monto, moneda, cuenta o tarjeta, cuotas, fecha, motivo y categoría. Lo que entendió queda a la vista para corregirlo y nada se guarda hasta tocar "Guardar". Si el texto no se entiende, se muestra el mismo mensaje que da el bot y el texto queda para corregirlo. Con una fecha ambigua, dos botones.
- **TXT-02** **Alias de cuentas y tarjetas**: en el formulario de cada cuenta y de cada tarjeta, "Nombres para escribir" ("mp", "mercado"; "visa"). Un alias es único por usuario y se compara sin mayúsculas ni tildes. Un alias de cuenta apunta a la cuenta, que se resuelve a su saldo en la moneda del monto.
- **TXT-03** **Reglas de comercio**: "si el motivo dice *coto*, la categoría es Supermercado". Se crean, editan y borran en Categorías (pestaña "Reglas" y en el detalle de cada categoría), y desde el bot al corregir una categoría (BOT-03).
- **TXT-04** **Reglas globales**: unas 35 reglas de comercios comunes de Argentina, mantenidas por el administrador (ADM-05), que apuntan al nombre de una categoría sugerida. Las reglas del usuario las pisan.
- **BOT-01** **Vincular Telegram** desde el perfil, con un enlace que abre el bot o con un código para mandarle. Desvincular desde el perfil o con `/desvincular`. Una cuenta de Telegram por cuenta de platin y viceversa.
- **BOT-02** **Cargar por mensaje**: el bot responde con lo que entendió y botones [Confirmar] [Cambiar categoría] [Cambiar cuenta] [Cancelar]. Recién al confirmar se crea el movimiento, el consumo con tarjeta o el programado.
- **BOT-03** **Corregir y aprender**: al cambiar la categoría, el bot ofrece crear una regla de comercio ("¿La próxima vez *coto* va a Supermercado?").
- **BOT-04** **Fecha ambigua**: "el 20" cuando hoy es 5 se pregunta con dos botones: [20/10 · ya pasó] [20/11 · programar].
- **BOT-05** **Comandos**: `/libre`, `/hoy`, `/pendientes`, `/proximos`, `/deshacer`, `/ayuda` y `/desvincular` (regla "Bot de Telegram").
- **BOT-06** **Mensajes no entendidos**: lo que el bot no pudo interpretar se guarda 90 días para mejorar el parser. La persona los ve y los borra en Perfil › Telegram; el administrador solo ve conteos.
- **BOT-07** **IA de respaldo** (fase 34, a diseñar): interpretar con IA lo que el parser no entiende (texto libre, varios gastos en un mensaje, fotos de tickets, audios). Opcional, del plan Pro y con límite diario.

## Reglas de negocio

Estas reglas son las que más errores generan si se dejan implícitas; cada una debe tener tests unitarios.

### Cuentas y reservas

- Cada cuenta tiene un saldo por moneda (el apartado Disponible) y reservas. Cada reserva tiene una sola moneda y un uso: para gastar, ahorro o inversión.
- Saldo de un apartado = saldo inicial + ingresos confirmados − gastos confirmados ± ajustes ± rendimientos − transferencias que salen + transferencias que entran. Se calcula, no se guarda.
- Saldo total de una cuenta = su saldo más sus reservas, separado por moneda.
- **Ingresos, gastos, fijos y programados van siempre al saldo de una cuenta.** Los pagos de tarjeta salen del saldo de una cuenta o de una reserva para gastar (ADR 0024). Una reserva no recibe ingresos ni gastos: la plata entra por transferencia desde el saldo de una cuenta y vuelve al saldo de una cuenta. También admite ajustes (para gastar y ahorro) o valuaciones (inversión).
- Toda transferencia tiene el saldo de una cuenta en al menos una punta: cuenta a cuenta, cuenta a reserva o reserva a cuenta. Entre dos reservas se pasa por una cuenta.
- La intención de una transferencia se deduce de las puntas: a una reserva de ahorro es apartar, a una de inversión es invertir, de ahorro o inversión a una cuenta es rescatar, y lo demás es mover.
- Mover entre monedas iguales pide un monto; entre monedas distintas pide los dos montos y muestra la cotización resultante (comprar dólares dentro de Mercado Pago).
- El uso define dónde aparece la reserva: para gastar junto a su cuenta, ahorro en la pantalla de ahorros, inversión en ahorros e inversiones. Las metas se vinculan a reservas de ahorro o inversión.
- La carga rápida preselecciona la última cuenta usada en la moneda del monto.
- El patrimonio suma los apartados marcados como "cuenta para patrimonio", valuados en moneda base.

### Dinero y monedas

- Montos en `numeric(18,2)` y cotizaciones en `numeric(18,6)`; nunca `float`. En TypeScript se usa una librería decimal; redondeo a 2 decimales, mitad hacia arriba.
- Cada movimiento guarda su moneda, la cotización a moneda base del día y el monto convertido. Ese valor queda congelado: si cambia la cotización, el histórico no se recalcula.
- En una transferencia entre monedas distintas, la cotización la define el usuario (los dos montos) y no la API.
- El patrimonio y los totales actuales se valúan con la cotización del día del tipo que eligió el usuario (oficial, MEP o blue).
- Las cotizaciones se guardan por día; si la API falla, se usa la última disponible y la UI lo indica.

Varias monedas:

- Monedas posibles: ARS, USD, EUR, BRL, CLP y UYU. La moneda base es ARS o USD.
- Todas las cotizaciones se guardan contra el peso (cuántos ARS vale una unidad). Para pasar entre dos monedas que no son el peso, se pasa por el peso: EUR → USD = (ARS por EUR) / (ARS por USD).
- El tipo de cotización preferido (oficial, MEP o blue) aplica solo al dólar; las demás monedas usan su cotización oficial.
- Los totales por moneda muestran solo las monedas que tienen saldo o movimientos; el total general se valúa en la moneda base.

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
- **Cuota en el resumen que falta pagar.** Entre el cierre de un resumen y su vencimiento, la cuota que la persona está pagando está en ese resumen y no en el abierto. Por eso, al cargar o editar un consumo ya empezado, si hoy está después del cierre del resumen anterior al abierto y no después de su vencimiento, el formulario pregunta "¿En qué resumen está la cuota k?":
  - "En el abierto (cierra 26/11)" — la opción por defecto; la cuota k va al resumen abierto, como hasta ahora.
  - "En el que cerró y todavía no pagaste (vence 5/11)" — la cuota k va a ese resumen y la k + 1 al abierto.
  - La segunda opción se ofrece solo si ese resumen no existe en platin o sigue sin cerrar en platin. Si no existe, se crea con sus fechas por defecto (o las corregidas).
  - Después de guardar, la app sugiere cerrar ese resumen con el total del banco (TAR-07), para poder pagarlo.
  - Al editar un consumo ya empezado, la opción vigente es la del resumen donde está hoy su primera cuota, y se puede cambiar mientras ninguna cuota esté en un resumen cerrado.
- Ejemplo: Visa con cierre el 26 y vencimiento el 5. El 2/11 cargo "voy por la 3 de 9" de $ 30.555,44 y elijo el resumen que vence el 5/11. La cuota 3 queda en el resumen de octubre (vence 5/11), la 4 en el de noviembre (vence 5/12) y la 9 en el de abril (vence 5/5). En Compromisos, noviembre suma $ 30.555,44 de esa compra.
- Editar el consumo regenera las cuotas que todavía no están en un resumen cerrado.
- Cuotas restantes = N menos cuotas en resúmenes cerrados; monto restante = suma de esas cuotas.

* Carga por valor de cuota: con cuota C y N cuotas, el total es C × N y todas las cuotas valen exactamente C (no hay diferencia de redondeo). Es la forma de cargar compras con interés, donde el banco informa la cuota y no el precio.
* Un plan de cuotas "terminó" cuando su última cuota está en un resumen cerrado.

### Cuotas más usadas

- Por tarjeta, se cuentan las cantidades de cuotas de los consumos de los últimos 12 meses (1 pago cuenta como 1) y se toman las dos más frecuentes. Con empate gana la menor.
- Si hay menos de dos, se completa con 1 pago y 3 cuotas, sin repetir. Una tarjeta nueva muestra [1 pago] [3 cuotas] [Otra].
- "Otra" acepta de 1 a 60, así se puede volver a 1 pago cuando no está entre las dos. Si se elige una que no es ninguna de las dos (o la trae el modo "Escribir", como "5c"), la tercera opción se ve como "5 cuotas" y se puede tocar para cambiarla.
- Ejemplo: en la Visa, en el último año, 6 consumos en 1 pago, 4 en 3 cuotas, 4 en 6 cuotas y 1 en 12. Las opciones son [1 pago] [3 cuotas] [Otra]: 3 y 6 empatan y gana la menor.

### Fijos y movimientos pendientes

- Los pendientes se generan **cuando el usuario abre la app**, para cada período vencido desde la última generación. No depende de un cron: el backend gratuito se duerme y un cron podría no correr.
- Un pendiente no impacta saldos ni presupuestos hasta que se confirma; al confirmar se puede corregir el monto.
- Un cambio de monto aplica desde el período indicado en adelante; los períodos anteriores conservan su monto.

* Un fijo en tarjeta no genera un pendiente: al sincronizar, crea directamente un consumo de un pago con su monto vigente, fechado el día del fijo, en el resumen que le corresponde, porque el banco lo debita solo. Se puede editar como cualquier consumo mientras su resumen esté abierto. Es idempotente por fijo y período.
* Un fijo en tarjeta es en pesos o en dólares, como la tarjeta.

### Movimientos programados

- Un ingreso o gasto con fecha posterior a hoy se guarda como pendiente de origen "programado". No impacta saldos, presupuestos ni "gastado" hasta que se confirma.
- Aparece en Compromisos y en los próximos 30 días de su mes. Desde el día de su fecha aparece en "Para confirmar", igual que los pendientes de fijos; al confirmar se puede corregir el monto y la fecha.
- Se puede editar o borrar antes de su fecha. La cotización se congela al confirmarlo, no al cargarlo.
- Las transferencias, inversiones y consumos con tarjeta no se programan: siguen con fecha hasta hoy.

### Compromisos de un mes

Comprometido del mes M = parte pendiente de los resúmenes que vencen en M (cuotas, consumos y ajustes, menos lo ya pagado) + fijos de gasto en apartado activos en M que no estén confirmados (con su monto vigente) + gastos programados de M sin confirmar. Los fijos en tarjeta ya forman parte de sus resúmenes; si todavía no se generó el consumo del período, se suman por su monto vigente en el resumen que les toca. En Compromisos, ingresos esperados = ingresos fijos de M + ingresos programados de M. Un resumen pagado no compromete nada; uno pagado en parte compromete lo que le falta.

La misma regla vale en Compromisos y en el inicio; lo que una pantalla muestra para un mes, la otra también. Todo se muestra separado por moneda y además valuado en moneda base.

### Libre este mes

Desde la iteración 6, el libre sale de lo que hay, no de lo que se movió en el mes:

Libre = en tus cuentas + por cobrar − a pagar este mes, en moneda base y con la cotización de hoy. Puede ser negativo.

- **En tus cuentas**: saldo de hoy de los saldos de cuenta y de las reservas para gastar. Las reservas de ahorro e inversión no cuentan.
- **Por cobrar**: ingresos fijos del mes sin confirmar (con su monto vigente) e ingresos programados del mes sin confirmar.
- **A pagar este mes**: el comprometido del mes (regla "Compromisos de un mes"): la parte pendiente de los resúmenes que vencen en el mes, los fijos de gasto sin confirmar y los gastos programados sin confirmar.
- **Las cuotas que vencen después de este mes no se restan** (ADR 0029): se pagan con la plata de los meses en que vencen. Una compra con tarjeta del mes solo baja el libre por la parte que vence este mes, que ya está en "a pagar".
- Pasar plata del saldo de una cuenta a una reserva de ahorro o inversión baja el libre (baja "en tus cuentas"); retirarla lo sube. Pasarla a una reserva para gastar no lo cambia.
- Los rendimientos y los ajustes de reservas de ahorro e inversión no cambian el libre; los ajustes del saldo de una cuenta o de una reserva para gastar sí, porque cambian lo que hay.
- **Meses anteriores**: el libre es lo que quedó en tus cuentas el último día del mes, sin por cobrar ni a pagar.
- **Por día**: libre ÷ días que faltan del mes, contando hoy, redondeado a pesos hacia abajo. El 5/11 con un libre de $ 106.061,83 faltan 26 días: $ 4.079 por día. Si el libre es 0 o negativo no hay por día: el inicio dice "No te queda libre este mes" y, si es negativo, cuánto falta para cubrir lo de este mes. En meses anteriores tampoco hay por día.
- **Lo que tiene cada cuenta para gastar**: su saldo más sus reservas para gastar. **Lo que paga este mes** una cuenta: lo que falta pagar este mes cuya cuenta de pago es esa (COM-04). **Le alcanza** si lo primero es mayor o igual que lo segundo; si no, el inicio dice cuánto le falta. Lo que no tiene cuenta de pago se muestra aparte, como "Sin cuenta asignada".

Ejemplo: en tus cuentas $ 726.150 de saldo y $ 450.000 en reservas para gastar (Gastos Previstos $ 220.000, Cuotas $ 120.000, Extras $ 110.000); por cobrar $ 0; a pagar este mes $ 379.418,27; Libre = 1.176.150 − 379.418,27 = $ 796.731,73. Si el 20 compro con tarjeta $ 90.000 en 3 cuotas que vencen en diciembre, enero y febrero, nada vence este mes: el libre sigue en $ 796.731,73. Si después paso $ 200.000 del saldo a la reserva Auto (ahorro), Libre = $ 596.731,73.

### Cómo se llega al libre

La tarjeta del libre cuenta el mes como una cuenta corriente que cierra exacta. Todo se calcula por moneda y se valúa con la cotización de hoy, igual que "en tus cuentas"; así las partes suman exactamente el total.

Lo que tuviste para el mes:
- **Tenías al empezar el mes**: saldo de las cuentas y de las reservas para gastar al cierre del último día del mes anterior.
- **Ingresos del mes**: los cobrados (ingresos confirmados con fecha en el mes) más los que faltan cobrar ("por cobrar").

A dónde fue:
- **Ya pagaste**: lo que salió de tus cuentas y reservas para gastar en el mes: gastos confirmados y pagos de resúmenes de tarjeta. Un consumo con tarjeta cuenta recién cuando pagás su resumen.
- **Reservaste**: lo que pasaste a reservas de ahorro o inversión, menos lo que retiraste de ellas.
- **Para pagar este mes**: lo mismo que "a pagar este mes" del libre.
- **Libre**: lo que queda. Es el mismo número de siempre: en tus cuentas + por cobrar − a pagar este mes.
- **Otros**: ajustes de saldo de cuentas y reservas para gastar, y la diferencia que deja cambiar plata de moneda dentro de tus cuentas. Se suma a lo que tuviste si es positivo y a lo que fue si es negativo. Solo aparece si no es 0.

Identidad que tiene que cerrar siempre: al empezar + ingresos ± otros = ya pagaste + reservaste + para pagar + libre. Si el libre es negativo, lo que fue supera lo que tuviste por exactamente ese monto.

En meses anteriores no hay por cobrar ni para pagar: el libre es lo que quedó al último día.

**El resumen del mes** (al tocar "Libre"):
- Arriba, lo que tuviste: al empezar y cada ingreso agrupado por categoría.
- Después, ya pagaste agrupado por categoría (las 6 más grandes y "Otras") y los pagos de tarjeta como "Resumen Visa Santander", con el período de compras que cubre.
- Reservaste por reserva, para pagar (lleva a la lista) y el libre.
- Cada grupo se abre y muestra sus movimientos.

Ejemplo (tests literales): tenías al empezar $ 300.000; cobraste $ 1.600.000 y faltan cobrar $ 400.000 (ingresos $ 2.000.000); ya pagaste $ 650.000; reservaste $ 904.000; para pagar $ 397.218; otros $ 0. En tus cuentas = 300.000 + 1.600.000 − 650.000 − 904.000 = $ 346.000. Libre = 346.000 + 400.000 − 397.218 = $ 348.782. La barra mide $ 2.300.000 = 650.000 + 904.000 + 397.218 + 348.782. Si en lugar de $ 904.000 reservaste $ 1.300.000, en tus cuentas = −$ 50.000 y Libre = −$ 47.218: la barra se pasa $ 47.218 y dice "Te pasaste $ 47.218".

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

- Los límites se verifican al crear y al volver a contar: si el usuario está en el límite o por encima, no puede crear otro de ese recurso ni hacer que uno vuelva a contar, pero puede seguir editando, archivando y borrando lo existente.
- Lo archivado no cuenta para el límite. Vuelve a contar al restaurarlo (una cuenta restaurada trae sus apartados, que también tienen que entrar), al reanudar un fijo pausado, al reactivar una meta cumplida o cancelada y al convertir el "Disponible" en otro tipo de apartado.
- Convertir un apartado en inversión requiere la funcionalidad de inversiones, igual que crearlo.
- Una funcionalidad deshabilitada oculta su pantalla y sus acciones; los datos que ya existían se conservan y vuelven a verse al habilitarla.
- El plan vigente es el último asignado que no venció; si no hay ninguno, el plan por defecto.

### Administración

- Ningún endpoint de administración devuelve montos, saldos, descripciones, categorías ni nombres de cuentas de un usuario. Las métricas son conteos.
- Un usuario suspendido no puede ingresar y sus sesiones se cierran. Sus datos se conservan.
- Toda acción del administrador que cambia algo queda en la auditoría, en la misma transacción que el cambio.
- El administrador no puede suspenderse ni quitarse el rol a sí mismo.

### Ingreso con proveedores

- Una cuenta de platin puede tener contraseña, uno o más proveedores vinculados, o ambos. Siempre tiene al menos uno: desvincular el último método se rechaza.
- Un proveedor identifica a la persona por su ID en ese proveedor, no por el email: si el email cambia en Google, la cuenta sigue siendo la misma.
- Primer ingreso con un proveedor:
  - Si ese proveedor ya está vinculado a una cuenta, se ingresa a esa cuenta.
  - Si no hay ninguna cuenta con ese email, se crea una nueva, con el mismo onboarding que el registro con contraseña.
  - Si ya existe una cuenta con ese email, **no se vincula sola**: se le pide a la persona que ingrese con su contraseña y vincule el proveedor desde el perfil. Así nadie puede tomar una cuenta ajena registrando antes ese email.
- Solo se aceptan emails que el proveedor marca como verificados.
- Las reglas de usuario suspendido y registro cerrado se aplican igual que en el ingreso con contraseña.

### Empezar de cero

- Está en el perfil, en una sección "Zona peligrosa" al final, separada del resto.
- Antes de confirmar se muestra qué se va a borrar, con conteos: cuentas, apartados, movimientos (incluidos pendientes y programados), transferencias, tarjetas con sus compras, fijos, metas y valuaciones.
- Para confirmar hay que escribir el email de la cuenta y, si la cuenta tiene contraseña, también la contraseña. Una cuenta que solo ingresa con Google confirma solo con el email.
- **Se borra**, todo junto o nada: cuentas, apartados, movimientos, transferencias, tarjetas con sus resúmenes, compras, cuotas, ajustes y pagos, fijos, metas y valuaciones. Si la casilla "Mantener mis categorías" está desmarcada, también las categorías propias.
- **Se conserva**: el usuario, la contraseña y los proveedores vinculados, el plan y las solicitudes de plan, las preferencias (moneda base, cotización, monedas activadas, accesos del inicio) y la sesión actual.
- Después queda igual que un usuario nuevo: la cuenta "Efectivo" con su Disponible en pesos y, si se borraron las categorías, las sugeridas vigentes. Las categorías de sistema (Ajuste, Rendimientos) existen siempre.
- Queda en la auditoría como acción del propio usuario, con los conteos y sin datos financieros.
- No se puede deshacer.

### Carga por texto

El parser es una función pura de `libs/domain`: recibe el texto, hoy, los alias, las reglas (del usuario y globales) y las categorías del usuario, y devuelve un borrador o un error. **Ante la duda no adivina.** Todos los ejemplos de esta sección son tests literales, con hoy = 5/11/2026.

**Montos**, en formato argentino:
- "3500", "3.500", "1.250.000", "1.500,50", "$3500". Un punto seguido de exactamente tres dígitos separa miles; la coma es decimal.
- Con multiplicador: "45k" y "45 mil" son 45.000; "3,5k" es 3.500; "28 lucas" es 28.000; "1,5 palos" y "1,5m" son 1.500.000.
- El monto se arma con `Money` y se redondea a 2 decimales, mitad hacia arriba. Un monto de 0 es `ZERO_AMOUNT`.

**Moneda**: pesos por defecto. "usd", "u$s", "u$d", "us$", "dólar", "dólares", "verdes" → USD; "eur", "euro", "euros" → EUR; "brl", "real", "reales" → BRL; "clp", "chilenos" → CLP; "uyu", "uruguayos" → UYU; "ars", "pesos" → ARS. Pegado al monto también vale: "20usd".

**Tipo**: gasto por defecto. Es ingreso si el texto empieza con "+" o tiene "cobré", "cobro", "sueldo", "ingreso" o "aguinaldo" (la palabra queda en el motivo).

**Cuenta o tarjeta**: por alias (TXT-02). Sin alias, la última cuenta o tarjeta usada, en la app o en el bot. Dos alias en el mismo texto es `SEVERAL_SOURCES`.

**Cuotas**: "3c", "x3", "3cuotas", "3 cuotas", "en 3 cuotas", de 1 a 60. Solo con tarjeta (`INSTALLMENTS_WITHOUT_CARD`); más de 60 es `TOO_MANY_INSTALLMENTS`.

**Fechas**:
- "hoy", "ayer" (4/11), "anteayer" (3/11), "mañana" (6/11, programado), "pasado mañana" (7/11, programado).
- "el 3" (3/11): un día de este mes que ya pasó es ese día.
- "el 20": un día de este mes que todavía no llegó es ambiguo, `AMBIGUOUS_DATE` con las dos opciones (20/10 y 20/11). Con tarjeta, siempre el pasado (20/10).
- "el próximo 20" y "el 20 que viene": siempre el que viene (20/11; "el próximo 3" es el 3/12).
- **Día y mes sin año ("3/11")**: la próxima vez que llega esa fecha, salvo que haya caído en los últimos 30 días, que es la pasada. "3/11" → 3/11/2026; "20/10" → 20/10/2026 (hace 16 días); "1/10" → 1/10/2027 (hace 35 días: la próxima, programado); "28/12" → 28/12/2026, programado; "15/3" → 15/3/2027, programado. Con tarjeta, siempre la última que ya pasó ("15/3" con la visa → 15/3/2026).
- Con año: "3/11/2026", "28/12/25".
- Una fecha que no existe ("31/2", "el 31 que viene" en noviembre) es `INVALID_DATE`. Más de 12 meses adelante es `DATE_TOO_FAR`.
- Una fecha posterior a hoy da un borrador **programado** (MOV-08). Con tarjeta es `CARD_CANNOT_BE_SCHEDULED`.

**Motivo**: las palabras que no son monto, moneda, alias, cuotas ni fecha, sin las de relleno ("en", "con", "de", "la", "el", "por", "a", "que", "pagué", "gasté"). Se guarda como lo escribió la persona, con sus mayúsculas y tildes ("Café"); solo para comparar se pasa a minúsculas y sin tildes. Vacío: el movimiento toma el nombre de la categoría (MOV-09).

**Categoría**, en este orden:
1. Las reglas de comercio del usuario.
2. Las reglas globales, si el usuario tiene una categoría con el nombre al que apuntan.
3. Una palabra del motivo de 4 letras o más con la que empiece el nombre de una categoría del mismo tipo ("super" → Supermercado, "nafta" → Nafta).

Una regla coincide por **palabra entera** ("gas" no agarra "gaseosa"); si coinciden varias del mismo nivel, gana la del patrón más largo. Si en el paso 3 hay dos candidatas ("comida" con Comida rápida y Comida casera), no elige: queda vacía para que la persona elija.

**Otros errores**: sin monto, `NO_AMOUNT`; dos montos ("luz 18000 y gas 12000"), `SEVERAL_AMOUNTS`; un ingreso con tarjeta, `INCOME_ON_CARD`; una tarjeta en una moneda que no es pesos ni dólares, `CARD_CURRENCY`.

**Después del parser**, el servicio valida lo que depende de los datos antes de mostrar el borrador: que la moneda esté activada (`CURRENCY_NOT_ENABLED`), que la cuenta tenga saldo en esa moneda (`NO_BALANCE_IN_CURRENCY`) y que el alias siga existiendo.

Ejemplos que tienen que pasar tal cual:

| Texto | Resultado |
| --- | --- |
| café 3500 | Gasto de $ 3.500, motivo "café", categoría por regla, hoy |
| super 45k visa 3c | Consumo de $ 45.000 en 3 cuotas con la visa, Supermercado |
| sueldo 1.800.000 mp | Ingreso de $ 1.800.000 en Mercado Pago, Sueldo |
| pagué el plomero con efe 28 lucas ayer | Gasto de $ 28.000 en efectivo, motivo "plomero", 4/11, sin categoría |
| netflix usd 20 | Gasto de USD 20 |
| turno médico 15000 el próximo 20 | Gasto programado de $ 15.000 el 20/11 |
| turno médico el 20 15000 | `AMBIGUOUS_DATE`: 20/10 o 20/11 |
| zapatillas 90000 visa el 20 | Consumo del 20/10 |
| zapatillas 90000 visa mañana | `CARD_CANNOT_BE_SCHEDULED` |
| heladera 900000 3c | `INSTALLMENTS_WITHOUT_CARD` |
| super 5000 mp visa | `SEVERAL_SOURCES` |
| + 5000 visa | `INCOME_ON_CARD` |
| taxi 8000 31/2 | `INVALID_DATE` |

### Bot de Telegram

**Vinculación**
- En Perfil › Telegram, "Vincular" genera un enlace `t.me/<bot>?start=<código>` y el mismo código para mandar como `/vincular <código>` desde otro dispositivo. El código es aleatorio, de un solo uso y vence a los 10 minutos; en la base se guarda su hash.
- Una cuenta de Telegram queda vinculada a una sola cuenta de platin y viceversa. Vincular otra reemplaza la anterior, con aviso.
- El bot solo atiende chats privados; en grupos no responde.
- La identidad es la cuenta de Telegram vinculada: el `userId` nunca viaja en un mensaje ni en un botón. Cada botón lleva solo el id de su borrador y el servidor verifica que el borrador sea de ese chat.
- Un usuario suspendido recibe "Tu cuenta de platin está suspendida." y no se procesa nada. Eliminar la cuenta borra el vínculo; "Empezar de cero" (AUTH-09) lo conserva y borra los borradores y los mensajes no entendidos.

**Borradores**
- Cada mensaje entendido crea un borrador que vence a las **2 horas**. Un botón de un borrador vencido responde "Este borrador venció. Mandalo de nuevo."
- Confirmar crea el movimiento llamando a los mismos servicios que la carga rápida; un segundo toque no crea otro.
- "Cambiar categoría" muestra hasta 8 categorías del tipo (las recientes primero) y "Otra", que pide escribir el nombre. "Cambiar cuenta" muestra las cuentas y, si es un gasto, las tarjetas.
- Después de cambiar la categoría, el bot ofrece la regla con la primera palabra del motivo: "¿La próxima vez *coto* va a Supermercado?" [Sí] [No]. La regla se puede editar después en la web.
- Lo que entra por el bot se marca como entrado por Telegram, sin cambiar su origen (un programado sigue siendo programado).

**Comandos**
- `/libre`: "Te quedan $ 106.062 para gastar este mes (≈ $ 4.079 por día hasta el 30/11)."
- `/hoy`: lo cargado hoy, con el total.
- `/pendientes`: los movimientos para confirmar, cada uno con [Confirmar].
- `/proximos`: los próximos 5 pagos con fecha, monto y cuenta.
- `/deshacer`: ofrece borrar el último movimiento entrado por el bot en las últimas 24 horas, con [Sí, borrar] [No]. No se puede si un consumo ya tiene una cuota en un resumen cerrado.
- `/ayuda` y `/desvincular`.
- Los saldos de las cuentas no se consultan por el bot, porque los mensajes quedan guardados en Telegram.

**Límites y planes**
- El bot está en todos los planes. La IA de respaldo (BOT-07) será del plan Pro.
- Hasta 30 mensajes por minuto por chat; pasado eso: "Vas muy rápido. Esperá un minuto."

**Textos**
- Bienvenida, al vincular: "¡Listo, {nombre}! Ya podés cargar desde acá. Mandame algo como *super 45k visa 3c* o *+ 50000 freelance*. Antes de guardar te muestro lo que entendí."
- Chat sin vincular: "Este chat no está vinculado a platin. Entrá a platin › Perfil › Telegram y tocá Vincular."
- Código vencido o usado: "Ese código ya no sirve. Generá uno nuevo en platin › Perfil › Telegram."
- `/ayuda`: "Escribime el gasto en una línea: *super 45k visa 3c*, *taxi 8000 ayer*, *netflix usd 20*, *turno médico 15000 el 20 que viene*. Para un ingreso, empezá con + o usá *sueldo* o *cobré*. Comandos: /libre /hoy /pendientes /proximos /deshacer /desvincular."
- Lo que entendió: "Gasto · $ 45.000 · Supermercado · Visa Santander · 3 cuotas de $ 15.000 · hoy" (o "Ingreso", o "Programado para el 20/11"). Si no tiene categoría: "Sin categoría: elegí una antes de confirmar." y [Confirmar] no aparece hasta elegirla.
- Confirmado: "Guardado ✓ Te quedan $ 106.062 este mes." Cancelado: "Listo, no guardé nada."
- Errores del parser:
  - `NO_AMOUNT`: "No encontré el monto. Probá así: *super 4500*."
  - `ZERO_AMOUNT`: "El monto tiene que ser mayor a cero."
  - `SEVERAL_AMOUNTS`: "Encontré más de un monto. Mandame un gasto por mensaje."
  - `SEVERAL_SOURCES`: "Nombraste más de una cuenta o tarjeta. Dejá una sola."
  - `INSTALLMENTS_WITHOUT_CARD`: "Las cuotas van con tarjeta. Agregá cuál, por ejemplo *visa 3c*."
  - `TOO_MANY_INSTALLMENTS`: "Puedo cargar hasta 60 cuotas."
  - `CARD_CANNOT_BE_SCHEDULED`: "Las compras con tarjeta no se programan. Cargala el día que la hagas."
  - `INCOME_ON_CARD`: "Un ingreso no puede ir a una tarjeta. Decime a qué cuenta entra."
  - `CARD_CURRENCY`: "Las tarjetas son en pesos o en dólares."
  - `INVALID_DATE`: "Esa fecha no existe. Probá con *3/11* o *ayer*."
  - `DATE_TOO_FAR`: "Puedo programar hasta 12 meses adelante."
  - `AMBIGUOUS_DATE`: "¿Qué 20?" con [20/10 · ya pasó] [20/11 · programar].
  - `CURRENCY_NOT_ENABLED`: "No tenés activados los {moneda}. Activalos en platin › Perfil › Monedas."
  - `NO_BALANCE_IN_CURRENCY`: "{cuenta} no tiene saldo en {moneda}."
- Un texto que no es ningún comando ni se entiende se guarda en mensajes no entendidos (BOT-06) y recibe el mensaje de su error.

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
- Criptomonedas como moneda (USDT, BTC). Se pueden seguir como apartados de inversión con valuación manual.
- Cuentas compartidas entre usuarios (pareja, familia).
- App móvil nativa o modo offline; la web es responsive.
- Cobro real de suscripciones: los planes funcionan sin cobrar; la pasarela (Mercado Pago) se suma más adelante.
- Migración de datos desde la versión actual: se cargan a mano.
- Una pantalla con lo ya comprometido en cuotas para los meses que vienen (lo que antes restaba "tarjeta de los meses siguientes" en el libre, ADR 0029). Por ahora se ve en Compromisos.

### Iteración 2 (octubre 2026)

Después de usar el MVP, el modelo de cuentas planas no representaba cómo está organizada la plata: una institución con reservas en pesos y dólares terminaba partida en varias cuentas. Esta iteración agrega:

- Apartados dentro de las cuentas (CTA-01 a 07) e inversiones como apartados con valuación manual (INV-01 a 05).
- Gestión de categorías por usuario (CAT-01 a 05).
- Edición de consumos de tarjeta (TAR-11).
- Selectores y campos de fecha propios en todos los formularios.

La base de datos se recrea desde cero: no se migran los datos cargados durante el MVP.

### Iteración 3 (octubre 2026)

Cuatro frentes para que platin se parezca más a un producto:

- Una landing con más identidad y movimiento (LAN-01 y la sección "Landing"), a partir de tres direcciones visuales en el canvas de mockups.
- Un usuario administrador con métricas, gestión de usuarios y configuración global (ADM-01 a 07).
- Planes con límites, asignados por el administrador y sin cobro (PLN-01 a 06). El cobro real con Mercado Pago queda fuera de alcance por ahora.
- Ingreso con proveedores externos (AUTH-06 a 08): la arquitectura admite varios, y por ahora se implementa solo Google.

### Iteración 4 (octubre 2026)

Ajustes que salieron del uso diario:

- Lo que no incluye el plan se ve marcado antes de tocarlo (PLN-07).
- Accesos rápidos personalizables en el inicio (DAS-04).
- Crear categorías sin salir de la carga (CAT-06).
- Tarjetas: carga por valor de cuota (TAR-02), historial de resúmenes y de compras (TAR-12, 13) y fijos en tarjeta (TAR-09).
- Varias monedas: euro, real, peso chileno y peso uruguayo (MON-01 a 05).

### Iteración 5 (noviembre 2026)

Que todo cierre: cada peso está en un solo lugar y los números de una pantalla coinciden con los de otra.

- Invertir y rescatar como un movimiento más (MOV-07) y "Libre este mes" que descuenta lo separado (DAS-05).
- Ajustar saldo y Actualizar valor explican para qué sirven y llevan a la acción correcta (CTA-06).
- Gastos e ingresos programados (MOV-08) y compromisos que incluyen fijos en tarjeta y la parte pendiente de resúmenes pagados en parte (COM-02).
- Cambiar el apartado al editar un movimiento (MOV-04) y valores exactos en todos los gráficos (DAS-06).
- Empezar de cero desde el perfil, con la opción de mantener las categorías (AUTH-09).
- Cargar compras ya empezadas cuando el banco ya cerró el resumen y todavía no venció (TAR-03).

### Iteración 6 (noviembre 2026)

Cuentas más simples y un libre que coincide con lo que hay en el banco.

- Cuentas con su saldo y reservas, como en Mercado Pago. La plata entra y sale de las reservas solo por transferencias, con Ingresar y Retirar (CTA-02 a 06, MOV-01, 02).
- "Libre este mes" calculado desde los saldos, con las compras con tarjeta de los meses siguientes y sin contar nada dos veces (DAS-05). Después, ADR 0029 sacó del libre las cuotas que vencen en los meses siguientes.
- Carga rápida sin scroll y con el motivo siempre visible (MOV-09); "Guardar" al editar un programado (MOV-04); Compromisos con la cuenta de pago de cada línea (COM-04).

### Iteración 7 (noviembre 2026)

- Un inicio que se entiende de un vistazo y sirve para el uso diario, en celular y en escritorio (DAS-05, DAS-07).
- La carga rápida usa el selector de categorías de los demás formularios (MOV-09).

### Iteración 8 (noviembre 2026)

Cargar escribiendo: en la app y desde Telegram, con un parser con reglas y sin IA.

- Carga por texto en la web, alias de cuentas y tarjetas, reglas de comercio del usuario y globales (TXT-01 a 04).
- Bot de Telegram con vinculación, borradores con confirmación, corrección que aprende y comandos (BOT-01 a 06).
- La IA de respaldo queda para una fase aparte (BOT-07).

### Iteración 9 (noviembre 2026)

- Elegir las cuotas sin scroll, con las dos más usadas de la tarjeta y "Otra" (TAR-02).
- La pestaña Cuotas muestra las cuotas del resumen elegido en el gráfico, con meses anteriores y siguientes (TAR-05, COM-03).

### Iteración 10 (noviembre 2026)

Menos secciones y mejor agrupadas, y pantallas que usan el ancho del escritorio.

- La barra lateral pasa de 12 secciones a 6, y "Más" de 8 a 3 más el perfil (NAV-01 a 03).
- Compromisos junta Próximos meses, Fijos y Para confirmar en pestañas (COM-05).
- Ahorros e inversiones junta las dos pantallas en pestañas (INV-06).
- Perfil y ajustes reagrupado, con Categorías y Reglas adentro (AUTH-10).

### Iteración 11 (noviembre 2026)

- La tarjeta del libre cuenta el mes de punta a punta: lo que tenías, lo que entró, lo que pagaste, lo que reservaste y lo que falta, con el resumen del mes y el exceso a la vista (DAS-05).
- Tus cuentas y sus pagos en una sola tarjeta (DAS-07).

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

**El color siempre significa algo.** Se usa para montos y estados (gasto, pendiente, libre, tarjeta, transferencia) y para las categorías, que tienen el color que elige el usuario. Íconos, accesos, menús y botones secundarios van en tinta y gris; el verde de marca queda para la acción principal, los enlaces y el foco.

Coral pasa de acento a color funcional porque las finanzas necesitan un "negativo" claro. El verde y el coral tienen poco contraste sobre blanco: se usan como fondos, íconos y texto grande; para texto chico se definen variantes más oscuras.

### Tipografía

- **Uncut Sans** para títulos, interfaz y texto.
- **JetBrains Mono** para todos los montos y fechas: los números quedan alineados en columnas y le da a la app un sello propio.

### Propuesta de interfaz

1. **Inicio = "Libre este mes"**: un número grande (lo que hay en tus cuentas + por cobrar − a pagar este mes) con una barra que muestra cómo se reparte. Debajo, los próximos 30 días como línea de tiempo: vencimientos de tarjeta, cuotas y fijos.
2. **Carga rápida en 3 toques**: botón + siempre visible que abre una hoja inferior que entra sin scroll. Primero el teclado numérico con el monto y el motivo debajo, después las categorías recientes como chips en una fila; la cuenta usada la última vez viene preseleccionada. En escritorio, también con Ctrl+K.
3. **Bandeja "Para confirmar"**: los pendientes de fijos aparecen como una lista tipo inbox; se confirman deslizando o en lote.
4. **Tarjetas como tarjetas**: cada una se ve como una tarjeta física en violeta con el resumen abierto, días al cierre y total en pesos y dólares. Dentro, las cuotas activas con una barra "4 de 12".
5. **Metas con anillo de progreso**: acumulado, faltante, aporte mensual necesario en grande y una etiqueta de ritmo (adelantado o atrasado).
6. **Navegación**: en celular, barra inferior con Inicio, Movimientos, + , Tarjetas y Más; en escritorio, barra lateral con seis secciones (NAV-01).
7. **Modo oscuro** sobre Tinta desde el primer día.
8. **Ocultar montos** con un toque (ícono de ojo), para usar la app en público.
9. **Estados vacíos con guía**: cada pantalla sin datos explica qué cargar primero, ya que todo se carga a mano.

Antes de implementar conviene bajar estas pantallas a mockups: Inicio, Carga rápida, Tarjeta con cuotas y Meta.

### Formularios

- **Selectores propios** en lugar de las listas nativas del navegador: con búsqueda, ícono y color de cada opción, y un dato secundario (saldo y moneda de una cuenta o reserva, tipo de una categoría). Agrupan opciones (reservas por cuenta) y se manejan con teclado. En celular se abren como hoja inferior.
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
