# Perfil y ajustes (iteración 10) — design reference

Mockups del perfil reagrupado (fase 36), exportados del canvas de diseño. Son una REFERENCIA, no código de producción: los valores de diseño (colores, tamaños, espaciados, radios, orden de las secciones) están en los `style="…"` y hay que replicarlos con los tokens de Tailwind y los componentes de `libs/web-ui`, no copiar el markup.

## Contenido

- `Escritorio.dc.html` — el perfil en escritorio (1440 px), con la barra lateral nueva y dos columnas: a la izquierda Monedas y cotización, Personalización y Telegram; a la derecha Tu plan, Ingreso y seguridad y Zona peligrosa. Arriba, a todo el ancho, tu nombre y tu email con el lápiz para editar el nombre. A menos ancho las columnas se apilan.
- `Celular.dc.html` — el perfil en un celular (390 px), con los mismos grupos en una columna y el título de cada grupo fuera de su tarjeta.
- `support.js`, `vendor/react*.js` — el runtime que dibuja los mockups en el navegador; no es parte del diseño.

## Lo que no se ve en el mockup

- Al tocar el lápiz, el nombre pasa a ser un campo en el mismo lugar, con "Guardar" y "Cancelar"; Enter guarda y Escape cancela.
- "Definir" en Contraseña abre, debajo de la fila, el campo y el botón que hoy están siempre abiertos.
- En un plan con límites, la frase del plan dice "3 de 5 cuentas" y marca en `pending-ink` lo que llegó al límite.

## Datos

El nombre, el email, el plan y el uso son los de la cuenta del usuario. Las cantidades de categorías figuran como `[N]`.

Los colores están en hex porque el editor no tiene los tokens: en la app, el rojo de la zona peligrosa y de "Desvincular" es `expense-ink` sobre borde `expense`.

La tipografía de los mockups es Hanken Grotesk porque Uncut Sans no estaba disponible en el editor; la app usa Uncut Sans y JetBrains Mono como siempre.

## Ver

Serví la carpeta (por ejemplo `python3 -m http.server`) y abrí cada `.dc.html`; algunos navegadores bloquean los scripts con file://.
