# 0016 — Ingreso con Google: detalles de implementación

Fecha: 2026-10-29 · Fase 20

## Contexto

La fase 20 suma el ingreso con Google (AUTH-06 a 08) según "Auth y seguridad > Ingreso con proveedores externos" de la arquitectura. Algunos detalles no estaban definidos o se resolvieron distinto; quedan acá para revisar.

## Decisiones

- **Tickets de vinculación en memoria.** El ticket de `POST /auth/oauth/:provider/link-ticket` (un solo uso, 60 s) se guarda hasheado en un `Map` del proceso, sin tabla nueva.
  - Alcanza con una sola instancia del API (Render). Si el API se reinicia en esos 60 s, la persona toca "Vincular" de nuevo.
  - Si algún día hay varias instancias, pasa a una tabla o a Redis.
- **La cookie `oauth_tx` va firmada, no cifrada.** Lleva `state`, el verificador PKCE, el `nonce`, `returnTo` y, al vincular, el id del usuario. Es httpOnly y vive 10 minutos; además, el vencimiento se controla en el servidor, no solo con `Max-Age`. Firmarla impide alterarla; quien pudiera leerla ya tendría acceso al navegador de la persona.
  - Se firma con `cookie-parser` y `OAUTH_COOKIE_SECRET`.
  - `Secure` sigue la misma regla que la cookie de refresh (`NODE_ENV=production`).
- **Errores al vincular vuelven al perfil.** La arquitectura dice que los errores van a `/ingresar?error=CODE`. Eso vale para el ingreso; al vincular, la persona ya tiene sesión, así que los errores vuelven a `/app/perfil?error=CODE` y el éxito a `/app/perfil?vinculado=google`.
- **Cuenta nueva → `/app/bienvenida`.** Como en el registro con contraseña, una cuenta creada con Google entra por la bienvenida, sin importar el `returnTo`.
- **Códigos de error nuevos:**
  - `OAUTH_PROVIDER_DISABLED`, `OAUTH_STATE_INVALID`, `OAUTH_CANCELLED` (la persona canceló en Google), `OAUTH_FAILED`.
  - `EMAIL_NOT_VERIFIED`, `ACCOUNT_EXISTS_LINK_REQUIRED`.
  - `LINK_TICKET_INVALID`, `IDENTITY_IN_USE` (esa cuenta de Google ya está vinculada a otro usuario) y `PROVIDER_ALREADY_LINKED` (el usuario ya tiene otra cuenta de Google).
  - `LAST_SIGN_IN_METHOD` y `PASSWORD_ALREADY_SET`.
- **`returnTo`** acepta solo rutas que empiezan con `/`, sin `//`, sin `\` y sin caracteres de control (los navegadores convierten `/\host` en otro sitio). Si no, `/app`. La regla vive en `libs/domain` (`safeReturnPath`).
- **Variables:** si `GOOGLE_CLIENT_ID` está definida, la validación exige `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL` y `OAUTH_COOKIE_SECRET`; el API no arranca con la configuración a medias.
- **`POST /auth/password`** entra en el límite estricto de intentos, como el login y el registro.
- **Botón de Google:** usa el logo oficial (`public/brand/google-g.svg`), el texto "Continuar con Google" y los colores de las pautas (claro y oscuro) como tokens `google-*` en `theme.css`. La tipografía es la de la app (Uncut Sans), no Roboto: las pautas la recomiendan, pero sumar otra fuente solo para un botón no se justifica.
- **Dependencia nueva:** `openid-client` 6, la que nombra la arquitectura. Es solo ESM; el API, que se compila a CommonJS, la carga con el `require` de módulos ESM de Node 22+ (la imagen usa Node 24).

## Consecuencias

- Sumar Facebook o Apple es una clase nueva que implementa `OAuthProvider` y sus variables en `providersFromConfig`.
- Los tests e2e inyectan un proveedor falso (`test/fake-oauth.ts`) que verifica PKCE, `nonce` y la dirección de retorno; nunca llaman a Google.
