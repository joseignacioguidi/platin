# 0030 — Decisiones de la fase 35 (cuotas más claras)

Fecha: 2026-11-06 · Fase 35 (TAR-02, TAR-05, COM-03)

## Contexto

La regla "Cuotas más usadas", TAR-05 y la sección "Iteración 9: cuotas" de la arquitectura definen la fase. Al implementarla quedaron dos preguntas que se acordaron con el usuario y algunos huecos menores.

## Decisiones

Acordadas con el usuario:

- **"Otra" acepta de 1 a 60**, no de 2 a 60. Si las dos más usadas son, por ejemplo, 3 y 6, "Otra" es la única forma de volver a 1 pago.
- **Las compras en 1 pago entran en la pestaña Cuotas**: en el gráfico, en el total del resumen ("en 3 cuotas" las cuenta) y en la lista, donde dicen "1 pago" sin barra de avance.

Tomadas al implementar:

- **Orden de las opciones.** Las dos más usadas se muestran de menor a mayor, no por frecuencia: [1 pago] [3 cuotas] [Otra], como en el ejemplo.
- **"Últimos 12 meses"** son los consumos con fecha desde hoy − 365 días.
- **Lo que libera un resumen** suma solo la última cuota de planes de 2 cuotas o más: una compra en 1 pago no es un plan que termina (COM-03).
- **Rango del gráfico.** `GET /cards/:id/statements/summary` devuelve los resúmenes que existen entre el primero y el último con cuotas, incluidos los del medio sin cuotas (dicen "No hay cuotas en este resumen."). No crea resúmenes que falten.
- **Barras en pesos.** La altura y el monto de cada barra usan el total en pesos; un resumen con cuotas en dólares las suma como "+ US$ X" en el encabezado de la lista.
- **Próximo resumen a pagar**, el elegido al entrar: el más viejo cerrado o pagado en parte; si no hay, el abierto; si no, el último.
- **La página del gráfico** arranca en el resumen elegido y se completa hacia atrás cerca del final; las flechas avanzan de a 6 sin salir del rango.
- **URL.** Elegir un resumen reemplaza la entrada del historial (`replaceUrl`) con `?period=`; con ese parámetro la página abre directo en la pestaña Cuotas.
- **Mismo endpoint con dos respuestas.** `GET /cards/:id/installments` responde los planes activos sin `period` y las cuotas del resumen con `period`; el serializador valida la unión de los dos esquemas.

## Consecuencias

- La lista de cantidades fijas (1, 2, 3, 6, 9, 12, 18, 24) de la carga rápida y los chips con campo del formulario de consumo se reemplazan por `pl-installments-picker`.
- `GET /cards` hace una consulta más por tarjeta para `topInstallments`.
