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

Todo dinero vive en una **cuenta** o en una **tarjeta**; los movimientos los mueven y todo lo demás (saldos, compromisos, avance de metas) se calcula. Cada entidad pertenece a un usuario.

| Entidad | Qué representa | Campos clave |
| --- | --- | --- |
| Usuario | Persona con su espacio de datos | email, contraseña, moneda base, cotización preferida para valuar (oficial, MEP, blue) |
| Cuenta | Donde está la plata: efectivo, banco, billetera virtual, ahorro, inversión | nombre, tipo, moneda, saldo inicial, archivada, cuenta para patrimonio |
| Categoría | Clasificación de ingresos y gastos | nombre, tipo (ingreso/gasto), ícono, color, categoría padre opcional |
| Movimiento | Ingreso o gasto sobre una cuenta | cuenta, categoría, monto, moneda, fecha, descripción, estado (pendiente/confirmado), tipo de cambio, monto en moneda base, origen |
| Transferencia | Plata que pasa de una cuenta a otra, incluida la compra de dólares | cuenta origen, cuenta destino, monto que sale, monto que entra, cotización implícita, fecha |
| Tarjeta de crédito | Una tarjeta con su ciclo | nombre, emisor, últimos 4, límite, día de cierre, día de vencimiento, cuenta de pago por defecto |
| Resumen | Un ciclo de la tarjeta | tarjeta, período, fecha de cierre, fecha de vencimiento, total ARS, total USD, estado (abierto, cerrado, pagado, pagado parcial) |
| Consumo | Una compra con tarjeta, en 1 o N cuotas | tarjeta, fecha, descripción, categoría, monto total, moneda, cantidad de cuotas, primer resumen |
| Cuota | Una parte del consumo que cae en un resumen | consumo, número (3 de 12), monto, resumen al que pertenece |
| Fijo | Gasto o ingreso que se repite: alquiler, sueldo, suscripciones | tipo, categoría, cuenta o tarjeta, monto, moneda, frecuencia, día, desde, hasta opcional |
| Presupuesto | Tope de gasto por categoría | categoría, monto mensual, moneda, vigente desde, vigente hasta opcional |
| Meta | Objetivo de ahorro | nombre, monto objetivo, moneda, fecha objetivo, cuentas vinculadas o aportes asignados |
| Inversión | Una posición en una cuenta de inversión | cuenta, instrumento (dólares, plazo fijo, FCI, CEDEAR, cripto, otro), monto invertido, valor actual cargado a mano, fecha de valuación |
| Cotización | Tipo de cambio de un día | fecha, par de monedas, tipo (oficial, MEP, blue), valor, fuente |

&#91;embedded content: relaciones del dominio · 11 entidades\]

La cuenta es el centro: movimientos, transferencias, metas e inversiones la afectan o la miden. Del lado de la tarjeta, cada consumo se parte en cuotas que caen en resúmenes mensuales.

Pagar un resumen es una transferencia de una cuenta a la tarjeta; por eso el gasto se registra una sola vez (en el consumo) y el pago no lo duplica.

## Módulos y casos de uso

Diez módulos; cada caso de uso tiene un código para referenciarlo en el plan de implementación.

### 1. Autenticación y perfil

- **AUTH-01** Registrarse con email y contraseña.
- **AUTH-02** Iniciar y cerrar sesión; la sesión se renueva sola (refresh token).
- **AUTH-03** Recuperar contraseña por email.
- **AUTH-04** Configurar moneda base y cotización preferida para valuar dólares.
- **AUTH-05** Onboarding inicial: crear primeras cuentas, tarjetas y categorías sugeridas.

### 2. Cuentas

- **CTA-01** Crear, editar y archivar cuentas (efectivo, banco, billetera, ahorro, inversión).
- **CTA-02** Ver saldo actual de cada cuenta y el total por moneda.
- **CTA-03** Ver el detalle de una cuenta con sus movimientos y la evolución del saldo.
- **CTA-04** Ajustar saldo: si el saldo real difiere, se crea un movimiento de ajuste por la diferencia.

### 3. Movimientos

- **MOV-01** Cargar ingreso o gasto con cuenta, categoría, monto, fecha y nota. Carga rápida desde un botón siempre visible.
- **MOV-02** Cargar una transferencia entre cuentas, incluida la compra o venta de dólares con su cotización.
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

- **INV-01** Registrar posiciones en cuentas de inversión: instrumento, monto invertido, moneda.
- **INV-02** Actualizar a mano el valor actual de una posición; queda historial de valuaciones.
- **INV-03** Ver rendimiento simple por posición y total invertido valuado en moneda base.

### 10. Dashboard, reportes y landing

- **DAS-01** Dashboard: patrimonio neto, ingresos y gastos del mes, próximo vencimiento de tarjetas, presupuestos en riesgo, avance de metas.
- **DAS-02** Reporte por categoría y por mes, con comparación contra el mes anterior.
- **DAS-03** Evolución del patrimonio en el tiempo.
- **LAN-01** Landing pública con propuesta de valor, capturas, funcionalidades y llamado a registrarse.
- **LAN-02** Páginas de login y registro con la misma identidad visual.

## Reglas de negocio

Estas reglas son las que más errores generan si se dejan implícitas; cada una debe tener tests unitarios.

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

- Acumulado = suma de saldos de las cuentas vinculadas convertidos a la moneda de la meta, o suma de aportes asignados si la meta no tiene cuentas.
- Meses restantes = meses entre el mes siguiente al actual y el mes objetivo, ambos incluidos (mínimo 1).

```latex
\text{aporte mensual} = \frac{\text{objetivo} - \text{acumulado}}{\text{meses restantes}}
```

- Ejemplo: objetivo USD 15.000 para diciembre 2027, acumulado USD 4.200 en octubre 2026. Faltan USD 10.800 en 14 meses, o sea USD 771,43 por mes.
- Ritmo: el esperado a hoy es el objetivo × meses transcurridos / meses totales desde la creación. Adelantado si el acumulado lo supera, atrasado si no.
- Simulación (MET-04): meses necesarios = faltante / aporte propuesto, redondeado hacia arriba.

### Inversiones

- Valor de una posición = último valor cargado a mano; si no hay, el monto invertido.
- Rendimiento = (valor actual − invertido) / invertido, en la moneda de la posición.
- El patrimonio suma las posiciones valuadas, no el saldo contable de la cuenta de inversión.

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
- Cobro, planes pagos o cualquier aspecto comercial.
- Migración de datos desde la versión actual: se cargan a mano.

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
