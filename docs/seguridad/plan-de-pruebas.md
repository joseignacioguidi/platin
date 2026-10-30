# platin — Plan de pruebas de seguridad

Este plan lo ejecuta Claude Code sobre el repo de platin. El objetivo es encontrar fallas de seguridad antes de que las encuentre otro, dejar las verificaciones automatizadas en el CI y entregar un informe con lo encontrado.

Leé `CLAUDE.md`, `docs/arquitectura.md` (sobre todo "Auth y seguridad", "Administración y planes" y "Docker y VPS") y `docs/especificacion.md` (reglas "Administración", "Planes" e "Ingreso con proveedores") antes de empezar.

---

## 1. Reglas de la prueba

1. **Solo contra platin.** Nunca contra Google, DolarApi, Vercel, Render, Neon ni ningún otro servicio de terceros. Los proveedores externos se reemplazan por dobles en los tests.
2. **Todo se prueba en local**, con la base de Docker y datos de prueba. Contra producción solo se hacen las verificaciones de la sección 13, que son de lectura y con mis propias cuentas.
3. **Nada de carga ni denegación de servicio.** Para el rate limiting alcanza con superar el umbral una vez; los planes gratuitos de Render y Neon no se estresan.
4. **No corrijas nada sin avisarme.** Primero el informe; después, por cada hallazgo, una rama y un PR separados, empezando por los de severidad más alta.
5. **Si una funcionalidad todavía no existe** (por ejemplo, admin, planes o Google), marcá sus pruebas como "No aplica" y seguí.
6. **No pongas secretos reales** en tests, fixtures, el informe ni los commits.

## 2. Preparación

1. Rama `security/plan-de-pruebas`.
2. Base local limpia: `docker compose up -d`, migraciones y la API y la web levantadas como dice el README.
3. Datos de prueba, creados por un script `apps/api/test/security/seed.ts` reutilizable:
   - **Usuario A** y **usuario B**, cada uno con al menos una cuenta con dos apartados (uno en ARS y uno en USD), una tarjeta con un consumo en cuotas, un resumen cerrado, un fijo, una meta vinculada a un apartado, un apartado de inversión con una valuación y una categoría propia.
   - **Admin**: un usuario cuyo email está en `ADMIN_EMAILS` (si existe la fase 18).
   - **Usuario suspendido** (si existe la fase 18).
   - **Usuario solo-Google**, sin contraseña (si existe la fase 20).
4. Un helper de tests que loguea a cada usuario y devuelve su access token y su cookie de refresh.
5. Antes de probar, armá el **inventario de endpoints** leyendo los controladores de `apps/api/src` (método, ruta, si es público y qué recurso toca). Va como anexo del informe y es la base de las pruebas de autorización.

## 3. Cómo se ejecuta y se entrega

- **Automatizable** (casi todo): un test e2e por prueba en `apps/api/src/security/*.e2e-spec.ts` o `apps/api/test/security/`, con el ID de la prueba en el nombre (`it('SEC-AUTHZ-03 ...')`). Quedan en el CI para que no vuelvan a aparecer.
- **Estático**: búsquedas en el código y herramientas (`pnpm audit`, gitleaks o equivalente). Se documenta el comando y el resultado.
- **Manual**: lo que no se puede automatizar se documenta con el `curl` o los pasos exactos.
- **Informe**: `docs/seguridad/informe-AAAA-MM-DD.md` con:
  - Resumen: cuántas pruebas pasaron, fallaron y no aplican, y los hallazgos por severidad.
  - Tabla de resultados: ID, resultado (Pasa, Falla, No aplica), evidencia (test o comando).
  - Un apartado por hallazgo: ID, severidad, descripción, cómo reproducirlo, impacto en platin y corrección propuesta.
  - Anexo: inventario de endpoints.

### Severidades

| Severidad | Criterio en platin |
| --- | --- |
| Crítica | Un usuario lee o modifica datos financieros de otro, o cualquiera obtiene acceso de admin |
| Alta | Robo o secuestro de sesión o de cuenta, saltear la autenticación, fuga de secretos |
| Media | Saltear límites de plan, fuga de datos de cuenta (no financieros), falta de rate limiting en login |
| Baja | Cabeceras faltantes, mensajes de error con detalle interno, enumeración de usuarios |
| Informativa | Mejoras sin riesgo concreto hoy |

---

## 4. Autenticación y sesiones

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-AUTH-01 | Endpoint protegido sin token, con token mal formado, con firma alterada y con `alg: none` | 401 en todos los casos |
| SEC-AUTH-02 | Token de acceso vencido (forzar el reloj o firmar uno con `exp` pasado) | 401 |
| SEC-AUTH-03 | Token firmado con otro secreto | 401 |
| SEC-AUTH-04 | Token válido de A con el claim `sub` cambiado a B (re-firmado con un secreto falso) | 401 |
| SEC-AUTH-05 | Cookie de refresh: atributos `HttpOnly`, `Secure` (fuera de local), `SameSite=Lax` y `Path=/api/v1/auth` | Todos presentes |
| SEC-AUTH-06 | Rotación: usar un refresh token dos veces | El segundo uso falla y revoca toda la familia; el token nuevo emitido en el primer uso tampoco sirve |
| SEC-AUTH-07 | Logout y después usar el refresh token anterior | 401 |
| SEC-AUTH-08 | El refresh token se guarda hasheado en la base, no en texto plano | Solo hash en `RefreshToken.tokenHash` |
| SEC-AUTH-09 | Contraseñas: hash argon2id; mínimo de 10 caracteres en registro y en "definir contraseña" | Se cumple; contraseñas cortas rechazadas |
| SEC-AUTH-10 | Enumeración: login con email inexistente vs. contraseña incorrecta; registro con email existente | Mismo mensaje y código en el login; el registro no revela más de lo necesario (documentar qué revela) |
| SEC-AUTH-11 | Rate limiting en `/auth/login`, `/auth/register` y `/auth/refresh` | Al superar el umbral, 429 |
| SEC-AUTH-12 | El access token no se guarda en `localStorage` ni `sessionStorage` en el front | Solo en memoria (buscar en `apps/web`) |
| SEC-AUTH-13 | Login de un usuario suspendido y refresh de una sesión de un usuario suspendido después | `ACCOUNT_SUSPENDED` y sesión invalidada |
| SEC-AUTH-14 | Login con contraseña a una cuenta solo-Google | Mismo error genérico de credenciales inválidas |
| SEC-AUTH-15 | Todas las respuestas de `/auth/*` llevan `Cache-Control: no-store` | Presente |

## 5. Ingreso con Google (si existe la fase 20)

Usar un `GoogleProvider` falso inyectado; nunca llamar a Google.

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-OAUTH-01 | Callback sin cookie `oauth_tx`, con `state` distinto al de la cookie o con la cookie vencida | Error y redirección a `/ingresar?error=...`; no se crea sesión |
| SEC-OAUTH-02 | `id_token` con `nonce` distinto, audiencia distinta o emisor distinto | Rechazado |
| SEC-OAUTH-03 | Cookie `oauth_tx`: firmada, `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth/oauth`, 10 minutos; se borra en el callback | Se cumple; alterar la cookie invalida la firma |
| SEC-OAUTH-04 | Redirección abierta: `returnTo=https://evil.com`, `//evil.com`, `/\evil.com`, `%2F%2Fevil.com`, `javascript:` | Todas rechazadas o reemplazadas por `/app` |
| SEC-OAUTH-05 | La URI de retorno sale de `PUBLIC_APP_URL` aunque el pedido traiga otro `Host` o `X-Forwarded-Host` | No cambia |
| SEC-OAUTH-06 | Toma de cuenta: B ingresa con Google con el email de A (cuenta con contraseña) | `ACCOUNT_EXISTS_LINK_REQUIRED`; no se vincula ni se ingresa a la cuenta de A |
| SEC-OAUTH-07 | Perfil de Google con `email_verified: false` | Rechazado |
| SEC-OAUTH-08 | Ticket de vinculación: reusado, vencido (más de 60 s), de otro usuario o inventado | Rechazado |
| SEC-OAUTH-09 | Vincular a B una identidad de Google que ya está vinculada a A | Rechazado; A conserva el vínculo |
| SEC-OAUTH-10 | Desvincular el último método de ingreso | `LAST_SIGN_IN_METHOD` |
| SEC-OAUTH-11 | Desvincular una identidad de otro usuario (`DELETE /auth/identities/:id` con ID ajeno) | 404 |
| SEC-OAUTH-12 | Ningún token (access, refresh o de Google) aparece en una URL, en logs ni en el `Referer` | No aparece |

## 6. Autorización entre usuarios (IDOR)

Es la sección más importante: la regla es que el `userId` sale siempre del token y que un recurso ajeno responde 404. Recorrer **todo** el inventario de endpoints, no solo los de esta tabla.

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-AUTHZ-01 | Con el token de A, `GET`, `PATCH` y `DELETE` de cada recurso de B por ID: cuentas, apartados, movimientos, transferencias, tarjetas, resúmenes, consumos, fijos, metas, valuaciones, categorías, identidades | 404 en todos; los datos de B no cambian |
| SEC-AUTHZ-02 | Listados de A (`GET /transactions`, `/accounts`, `/cards`, etc.) con filtros que apuntan a IDs de B (`?accountId=`, `?pocketId=`, `?categoryId=`) | Lista vacía o 404; nunca datos de B |
| SEC-AUTHZ-03 | **Referencias cruzadas en escrituras:** A crea un movimiento en un apartado de B, o con una categoría de B | 404 o 400; no se crea nada |
| SEC-AUTHZ-04 | A crea una transferencia desde su apartado **hacia un apartado de B** (sería mandarle plata) y desde un apartado de B hacia el suyo (sería robarle) | Rechazadas las dos |
| SEC-AUTHZ-05 | A paga un resumen de B, o paga su resumen desde un apartado de B | Rechazado |
| SEC-AUTHZ-06 | A vincula a su meta un apartado de B; A carga un fijo que sale de un apartado de B o de una tarjeta de B | Rechazado |
| SEC-AUTHZ-07 | A fusiona su categoría en una categoría de B, o una de B en una suya | Rechazado |
| SEC-AUTHZ-08 | A carga una valuación para un apartado de inversión de B (`POST /investments/valuations` en lote mezclando un ID propio y uno ajeno) | Todo el lote rechazado; nada se guarda |
| SEC-AUTHZ-09 | A confirma en lote pendientes de B (`POST /transactions/confirm` con IDs ajenos mezclados) | Los ajenos no se confirman; documentar si el lote entero falla o solo se ignoran |
| SEC-AUTHZ-10 | Asignación masiva: mandar `userId`, `id`, `role`, `status`, `planId`, `createdAt`, `systemKey`, `baseAmount` o `rateToBase` en bodies de creación y edición | Ignorados o rechazados (el esquema Zod debe ser estricto) |
| SEC-AUTHZ-11 | `POST /sync` y `GET /dashboard` de A no tocan ni muestran nada de B | Se cumple |
| SEC-AUTHZ-12 | IDs que no son UUID, UUID inexistentes y UUID de otro tipo de recurso | 400 o 404, nunca 500 |

## 7. Administración (si existe la fase 18)

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-ADM-01 | Usuario común contra cada endpoint de `/api/v1/admin/*` | 403 |
| SEC-ADM-02 | Usuario común con un JWT con `role: ADMIN` re-firmado con un secreto falso | 401 |
| SEC-ADM-03 | Admin al que se le quitó el rol en la base pero todavía tiene un token con `role: ADMIN` | 403 (el guard consulta la base) |
| SEC-ADM-04 | Ninguna respuesta de admin contiene montos, saldos, descripciones, categorías ni nombres de cuentas de usuarios (recorrer todas las respuestas buscando esos campos) | Se cumple |
| SEC-ADM-05 | Cada acción de admin que cambia algo queda en `AuditLog`; si la acción falla, no queda auditoría a medias | Se cumple |
| SEC-ADM-06 | El admin se suspende a sí mismo o se quita el rol | Rechazado |
| SEC-ADM-07 | Borrar un usuario sin `confirmEmail` o con un email que no coincide | Rechazado; con el correcto, se borran **todos** sus datos (verificar tabla por tabla) |
| SEC-ADM-08 | Configuración: el texto del aviso global con HTML o scripts (`<img src=x onerror=alert(1)>`) | Se muestra como texto, no se ejecuta |
| SEC-ADM-09 | Registro cerrado: `POST /auth/register` y el alta por Google | `REGISTRATION_CLOSED` en los dos |
| SEC-ADM-10 | `ADMIN_EMAILS` con mayúsculas, espacios o un email parecido (`jose@gmail.com.evil.com`) | Solo coincide el email exacto, sin distinguir mayúsculas |

## 8. Planes y límites (si existe la fase 19)

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-PLAN-01 | Usuario en el límite de cuentas, apartados, tarjetas, metas o fijos intenta crear otro | `PLAN_LIMIT_REACHED` |
| SEC-PLAN-02 | **Condición de carrera:** 10 pedidos de creación en paralelo estando a 1 del límite | Se crea uno solo |
| SEC-PLAN-03 | Caminos alternativos que crean recursos (onboarding, crear cuenta que crea su "Disponible", restaurar un archivado) | Respetan el límite |
| SEC-PLAN-04 | Funcionalidad fuera del plan: **todos** los endpoints de inversiones con un plan sin inversiones | `FEATURE_NOT_IN_PLAN` en todos |
| SEC-PLAN-05 | El usuario se cambia el plan solo (`PATCH /users/me` con `planId`, o aprobar su propia solicitud) | Imposible |
| SEC-PLAN-06 | Plan vencido | Vuelve al plan por defecto sin borrar datos |

## 9. Validación de entrada

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-INPUT-01 | Montos: negativos, `0`, `"1e9"`, `"NaN"`, `"Infinity"`, `"1,5"`, más de 2 decimales, más dígitos de los que entran en `Decimal(18,2)`, número en vez de string | 400 en todos los inválidos; ningún 500 |
| SEC-INPUT-02 | Fechas y períodos: `2026-02-30`, `2026-13`, formatos con hora, años extremos | 400 |
| SEC-INPUT-03 | Enums con valores inexistentes, `null` donde no corresponde, campos de más | 400 |
| SEC-INPUT-04 | Strings enormes (1 MB en una descripción) y body total grande | 400 o 413; tamaño máximo del body configurado |
| SEC-INPUT-05 | Inyección SQL: buscar `$queryRaw`, `$executeRaw` y `Unsafe` en el código; si existen, probar inyección en sus parámetros | Sin SQL armado con concatenación |
| SEC-INPUT-06 | XSS almacenado: descripciones, nombres de cuentas, apartados, categorías, metas y tarjetas con `<script>`, `<img onerror>` y `javascript:`; verlos en todas las pantallas | Se muestran como texto |
| SEC-INPUT-07 | Buscar en `apps/web` usos de `innerHTML`, `bypassSecurityTrust*`, `DomSanitizer` y `eval` | Ninguno con datos del usuario |
| SEC-INPUT-08 | Exportación CSV (si existe MOV-06): descripciones que empiezan con `=`, `+`, `-` o `@` | Se escapan (inyección de fórmulas) |
| SEC-INPUT-09 | Unicode raro: emojis, caracteres de control, RTL, normalización (dos categorías que se ven iguales) | Sin errores; documentar comportamiento |

## 10. Lógica de negocio

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-LOGIC-01 | Transferencia en la misma moneda con `amountIn` distinto de `amountOut` (crear plata de la nada) | Rechazada |
| SEC-LOGIC-02 | Transferencia de un apartado a sí mismo | Rechazada |
| SEC-LOGIC-03 | Doble envío: el mismo pedido de creación dos veces seguidas (doble click) | Documentar si se duplica; proponer idempotencia si corresponde |
| SEC-LOGIC-04 | `POST /sync` en paralelo 5 veces | No duplica pendientes ni resúmenes |
| SEC-LOGIC-05 | Cerrar dos veces un resumen; pagar más que el total; pagar un resumen abierto | Comportamiento según la especificación; sin estados inconsistentes |
| SEC-LOGIC-06 | Editar o borrar un consumo con cuotas en un resumen cerrado | `CARD_STATEMENT_CLOSED`, salvo descripción y categoría |
| SEC-LOGIC-07 | Borrar una valuación que no es la última | Rechazado |
| SEC-LOGIC-08 | Archivar un apartado con saldo distinto de 0 | `POCKET_NOT_EMPTY` |
| SEC-LOGIC-09 | Modificar movimientos de sistema (rendimientos, ajustes) por los endpoints comunes de movimientos | Documentar qué se permite y si rompe la regla de saldo |

## 11. Configuración, errores e infraestructura

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-CONF-01 | Secretos en el repo: gitleaks (o equivalente) sobre **todo el historial**; `.env` en `.gitignore`; `.env.example` sin valores reales | Sin secretos |
| SEC-CONF-02 | Dependencias: `pnpm audit --prod` | Sin vulnerabilidades altas o críticas sin justificar |
| SEC-CONF-03 | Errores: forzar un 500 (por ejemplo, base caída) y revisar la respuesta | Problem Details sin stack trace, SQL, rutas internas ni nombres de tablas |
| SEC-CONF-04 | Logs: no registran contraseñas, tokens, cookies, montos ni el body de `/auth/*` | Se cumple (revisar el logger y una ejecución real) |
| SEC-CONF-05 | Cabeceras de `helmet` en la API; en el front, CSP, `X-Content-Type-Options`, `Referrer-Policy` y `frame-ancestors` (revisar `vercel.json`/`vercel.ts`) | Presentes; documentar las que falten |
| SEC-CONF-06 | CORS: un `Origin` ajeno contra `/api/v1/*` y contra `/health` | Sin `Access-Control-Allow-Origin` para orígenes ajenos; nunca `*` con credenciales |
| SEC-CONF-07 | Middleware de cabecera secreta: pedido directo a la API sin `x-origin-secret` cuando `ORIGIN_SECRET` está definida | 403, salvo `/health`; la comparación es de tiempo constante |
| SEC-CONF-08 | `/health` no expone versiones, configuración ni detalles de la base | Se cumple |
| SEC-CONF-09 | Caché: las respuestas con datos de usuario llevan `Cache-Control: private, no-store` (Vercel respeta las cabeceras de caché del origen en los reenvíos) | Se cumple en todo `/api` |
| SEC-CONF-10 | Imagen Docker de la API: corre con usuario sin privilegios, sin `.env` ni código fuente innecesario adentro | Se cumple |
| SEC-CONF-11 | Variables obligatorias: la API no arranca si falta `JWT_ACCESS_SECRET` u otra crítica, ni con valores débiles conocidos | Falla al arrancar |
| SEC-CONF-12 | Source maps del front en producción | No se publican, o se documenta la decisión |

## 12. Privacidad de los datos

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-PRIV-01 | Borrado de cuenta (por admin, y por el usuario si existe): no queda ninguna fila con su `userId` ni filas hijas huérfanas | Se cumple tabla por tabla |
| SEC-PRIV-02 | Respuestas de la API: no incluyen `passwordHash`, `tokenHash` ni campos internos | Se cumple (revisar los serializadores) |
| SEC-PRIV-03 | Modo "ocultar montos": solo afecta la vista; documentar que no es una medida de seguridad | Documentado |

## 13. Verificaciones en producción (solo lectura)

Solo con mis cuentas y sin datos de nadie más. Antes de ejecutarlas, mostrame la lista exacta de pedidos y esperá mi OK.

| ID | Qué probar | Resultado esperado |
| --- | --- | --- |
| SEC-PROD-01 | Cabeceras de la landing y de `/app` en la URL de Vercel | Las de SEC-CONF-05 |
| SEC-PROD-02 | Pedido directo a la URL de Render sin la cabecera secreta (salvo `/health`) | 403 |
| SEC-PROD-03 | Atributos de la cookie de refresh en producción | `HttpOnly`, `Secure`, `SameSite=Lax` |
| SEC-PROD-04 | Una respuesta de `/api` pedida dos veces: Vercel no la sirve desde caché (cabecera `x-vercel-cache`) | `MISS` o sin caché |
| SEC-PROD-05 | Los source maps y archivos como `/.env`, `/.git/` no son accesibles | 404 |

---

## 14. Al terminar

1. Commit de los tests de seguridad en la rama `security/plan-de-pruebas` y de `docs/seguridad/informe-AAAA-MM-DD.md`.
2. Abrí un PR con el informe y los tests: los que fallan por un hallazgo real se marcan con `it.todo` o `it.skip` y un comentario con el ID del hallazgo, para que el CI siga en verde.
3. En el resumen del PR: la tabla de hallazgos ordenada por severidad y, para cada uno, la corrección que propondrías.
4. Esperá mi OK para empezar a corregir. Cada corrección va en su propia rama (`fix/sec-<id>`) y reactiva su test.
