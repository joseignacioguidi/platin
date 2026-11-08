# Onboarding (iteración 13) — design reference

Mockups del onboarding (fase 39), exportados del canvas de diseño. Son una REFERENCIA, no código de producción: hay que replicar textos, orden y valores con los tokens de Tailwind y los componentes de `libs/web-ui`, sin copiar el markup.

## Pantallas (celular, 390 px)

- `1-Cuentas.dc.html` — "¿Dónde tenés tu plata?": cuentas y saldo de hoy.
- `2-Tarjeta.dc.html` — "¿Tenés tarjeta de crédito?".
- `2b-Cargar-consumos.dc.html` — la pregunta "¿Querés cargar tus consumos actuales?" al guardar la tarjeta.
- `2c-Consumos-actuales.dc.html` — compras en cuotas ya empezadas y lo demás del resumen abierto.
- `3-Fijos.dc.html` — "¿Qué pagás o cobrás todos los meses?", con un fijo cuyo día ya pasó.
- `4-Tu-libre.dc.html` — el libre del mes y los próximos pasos.
- `Inicio-a-medias.dc.html` — el inicio con la configuración sin terminar.

`support.js` y `vendor/react*.js` son el runtime que dibuja los mockups; no son parte del diseño.

## Notas

- Los montos son de ejemplo y cierran entre pantallas: en tus cuentas $ 460.780, para pagar $ 380.000 (alquiler del 10), libre $ 80.780, hoy 8/11.
- La tipografía de los mockups es Hanken Grotesk porque Uncut Sans no estaba en el editor.
- En escritorio el recorrido es el mismo, centrado en una columna de 560 px.
- No está dibujada la pregunta de la fase 28 (en qué resumen está la cuota), que aparece en "Consumos actuales" entre el cierre y el vencimiento.

## Ver

Serví la carpeta (por ejemplo `python3 -m http.server`) y abrí cada `.dc.html`.
