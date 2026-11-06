# 0027 — Casos del parser que la especificación no cubría

Fecha: 2026-11-06 · Fase 32 (TXT-01 a 04)

## Contexto

La regla "Carga por texto" fija los ejemplos principales, pero al implementarla aparecieron casos sin respuesta. Siguiendo "ante la duda no adivina", estas son las decisiones tomadas. Todas tienen tests en `libs/domain/src/lib/text-entry.spec.ts`.

## Decisiones

- **Última cuenta o tarjeta usada.** El parser la recibe en el contexto (`lastUsed`) y solo la usa si no hay alias. Una tarjeta se usa solo si encaja: gasto, en pesos o dólares, y con una fecha que no sea posterior a hoy ni ambigua. Si no encaja, el borrador queda sin origen y el formulario (o el bot) usa su cuenta por defecto. Así "+ 5000" después de cargar con la visa no da `INCOME_ON_CARD`. La última usada la calcula la API (`GET /text-entry/context`) a partir del ingreso, gasto o consumo más reciente, sin contar los fijos.
- **"1.5" es decimal.** Un punto seguido de 1 o 2 dígitos no puede separar miles, así que se lee como decimal ("1.5k" = 1.500). "1.5000" no es un monto.
- **"el 31" cuando ese día no existe en uno de los dos meses.** Si solo una de las dos opciones existe (el 31 de octubre existe, el 31 de noviembre no), se usa esa y no se pregunta. Si no existe ninguna, `INVALID_DATE`.
- **29/2 sin año.** Es la próxima vez que llega esa fecha (puede ser dentro de más de 12 meses, y entonces es `DATE_TOO_FAR`); con tarjeta, la última que pasó. "31/2" o "1/13" son `INVALID_DATE`.
- **Un número de día seguido de un multiplicador es un monto.** "pan el 20 mil" es un gasto de $ 20.000 hoy, no del día 20.
- **"0c" no son cuotas.** Queda como texto del motivo. Más de 60 sigue siendo `TOO_MANY_INSTALLMENTS`.
- **Dos alias del mismo origen no son `SEVERAL_SOURCES`.** "mp mercado" nombra una sola cuenta. Un alias también coincide con dos palabras seguidas ("mercado pago" → `mercadopago`).
- **Las reglas se comparan con el texto que sobra, con las palabras de relleno.** Así la regla global "la anónima" funciona aunque "la" no quede en el motivo. El paso 3 (prefijo) usa solo las palabras del motivo.
- **Las reglas de la otra clase no aplican.** Una regla que apunta a una categoría de gastos no elige categoría en un ingreso.
- **Si aparecen dos fechas o dos monedas**, vale la primera; las palabras de la segunda fecha quedan en el motivo. No hay código de error para esto en la especificación.
- **Palabras reservadas como alias.** Un alias no puede ser una moneda, un multiplicador, una palabra de fecha o de cuotas, una de relleno ni solo números: nunca coincidiría. Se rechaza al guardarlo (400).
- **Errores de datos de la web y del bot.** Además de `CURRENCY_NOT_ENABLED` y `NO_BALANCE_IN_CURRENCY`, un alias cuyo origen ya no existe da `SOURCE_NOT_FOUND` ("Esa cuenta o tarjeta ya no existe. Elegí otra."). La verificación es una función pura de `libs/domain` (`checkTextEntryDraft`) que usan la web y la API, en lugar de dos implementaciones.
- **Reglas globales sin siembra en SQL.** Como las categorías sugeridas, las 35 reglas son el valor por defecto de `merchant-rules` en `SettingsService` (`DEFAULT_MERCHANT_RULES` en `libs/domain`). La fila se crea la primera vez que el administrador las guarda. El resultado es el mismo que sembrarlas en la migración y no duplica la lista en SQL.
- **Fusionar categorías mueve sus reglas** a la categoría de destino. No se cuentan entre los registros movidos.

## Consecuencias

- Si alguna de estas decisiones no te cierra, se cambia en el parser y en sus tests; no hay datos guardados que dependan de ellas, salvo los alias rechazados.
