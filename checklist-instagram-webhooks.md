# Checklist — Recibir DMs de Instagram (sin App Review)

Objetivo: que los webhooks `messages` de Instagram lleguen a gestionHotel y se vean en la
bandeja (`/messages`), **sin** pasar por App Review ni lanzar la app a produccion publica.

---

## 0. Diagnostico (ya verificado)

- Nuestro backend esta sano: se envio un POST **firmado** (HMAC con el app secret real) al webhook
  de la Lambda, respondio `HTTP 200`, creo `ChannelConversation` + `ChannelMessage` en la empresa 1 y
  luego se borro el dato de prueba.
- Las llamadas directas a Meta con el token guardado fallan con
  `{"message":"Unsupported request - method type: get/post","type":"IGApiException","code":100}`.
- No llego **ningun** webhook real: 0 conversaciones, 0 mensajes, sin logs `[channels]`/`[instagram]`.
- Causa: la app esta en **Development**. Meta exige que la app este **Live** para entregar
  notificaciones, y los `messages` ademas se configuran en **Messenger -> Instagram Settings**
  (no en el producto "Instagram").

Leccion clave: **Live NO es lanzamiento publico**. Con **Standard Access**, la app solo funciona
para cuentas con rol (admin/developer/tester). App Review + Business Verification recien hacen
falta para servir a hoteles de terceros (Advanced Access).

---

## 1. Valores concretos de esta instalacion

| Dato | Valor |
|---|---|
| Callback URL del webhook | `https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws/api/integrations/instagram/webhook` |
| Verify Token | `hotelia_webhook_ig_7f9k2x_misecreto` |
| Instagram App ID | `1430391189284587` |
| OAuth redirect URI | `https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws/api/integrations/instagram/callback` |
| Cuenta IG profesional conectada | `17841451185970286` (`alojamientoelnomada`, empresa 1 - Posada El Nomada) |
| Frontend | `https://d5foovh2z74go.cloudfront.net` |
| Politica de Privacidad | `https://d5foovh2z74go.cloudfront.net/privacidad.html` |
| Eliminacion de Datos | `https://d5foovh2z74go.cloudfront.net/eliminacion-de-datos.html` |

---

## 2. Antes de tocar Meta: publicar las paginas legales

Son requisito para pasar la app a Live.

- [ ] Completar en `frontend/public/privacidad.html` y `frontend/public/eliminacion-de-datos.html`
      los placeholders `[completar: ...]` (razon social y correo de contacto).
- [ ] Desplegar (`bash backend/deploy.sh`) para que queden publicas:
      - `https://d5foovh2z74go.cloudfront.net/privacidad.html`
      - `https://d5foovh2z74go.cloudfront.net/eliminacion-de-datos.html`
- [ ] Verificar que abran por HTTPS sin login.

---

## 3. Configurar Meta (App Dashboard)

> Importante: los DMs de Instagram se configuran en **Messenger -> Instagram Settings**.
> Configurar solo el producto "Instagram" hace que `messages` se descarte en silencio.

- [ ] **Agregar producto -> Messenger** (aunque la app sea solo de Instagram).
- [ ] Menu izquierdo -> **Messenger -> Configuracion de Instagram**.
- [ ] En **Webhooks**:
  - [ ] Callback URL = la de la tabla de arriba.
  - [ ] Verify Token = el de la tabla de arriba.
  - [ ] Guardar / Verificar (debe pasar el handshake `hub.challenge`).
  - [ ] Suscribir el campo **`messages`** (y `messaging_seen` si queres read receipts).
- [ ] En el producto **Instagram -> API setup with Instagram login -> Configure webhooks**:
  - [ ] Confirmar el mismo Callback URL y Verify Token.
  - [ ] Confirmar que el campo **`messages`** este suscripto.
- [ ] **Configuracion -> Basica**:
  - [ ] Privacy Policy URL = `https://d5foovh2z74go.cloudfront.net/privacidad.html`
  - [ ] Data Deletion Instructions URL = `https://d5foovh2z74go.cloudfront.net/eliminacion-de-datos.html`
  - [ ] Categoria e icono de la app.
  - [ ] Dominios de la app: agregar `d5foovh2z74go.cloudfront.net` y el host de la Lambda.
- [ ] Pasar **App Mode -> Live**.

> Con Standard Access, Live no expone la app al publico: solo cuentas con rol pueden usarla.

---

## 4. Roles de cuentas (dev)

- [ ] La cuenta del hotel (`@alojamientoelnomada`) debe tener rol en la app
      (admin/developer/tester) y ser **profesional** (Business/Creator).
- [ ] Agregar la cuenta **remitente** como **Instagram Tester**:
      Dashboard -> **Roles -> Instagram Testers** -> agregar usuario.
- [ ] Esa cuenta debe **aceptar** la invitacion en
      `https://www.instagram.com/accounts/manage_access/` (seccion "Invitaciones de tester").
- [ ] **No** hace falta "generar una clave API" ni convertir el tester en cuenta profesional.
      Si Meta pide "cambiar a cuenta profesional", estas en la pantalla equivocada
      (*API setup -> Generate access tokens*), no en la de testers.

---

## 5. Reconectar Instagram

El token guardado hoy es rechazado por Meta. Hay que emitir uno nuevo.

- [ ] En la app: **Ajustes -> Instagram -> Desconectar**.
- [ ] **Conectar Instagram** de nuevo con la cuenta profesional del hotel.
- [ ] Confirmar que la conexion quede `ACTIVE`.
- [ ] Al conectar, el backend ejecuta `POST /me/subscribed_apps` con `messages,messaging_seen`.

---

## 6. Probar de punta a punta

- [ ] Desde la cuenta **tester** (con la invitacion aceptada), mandar un DM de texto a
      `@alojamientoelnomada`.
- [ ] Abrir `/messages` en la app (sin refrescar) y ver si aparece la conversacion.
- [ ] Si no aparece, revisar:
  - [ ] Logs de la Lambda: `/aws/lambda/gestion-hotel-backend` (buscar `[channels]`, `[instagram]`).
  - [ ] Que el campo `messages` este suscripto en **Messenger -> Instagram Settings**.
  - [ ] Que la app este **Live**.
  - [ ] Que el remitente sea tester **aceptado**.
- [ ] Probar tambien respondiendo desde la bandeja (ventana de 24 h).

---

## 7. Que NO hace falta ahora

- [ ] App Review.
- [ ] Business Verification.
- [ ] Advanced Access.
- [ ] Lanzamiento publico.

Eso queda para cuando gestionHotel sirva a hoteles de terceros (multi-tenant real en produccion).

---

## 8. Referencias

- Docs: "Set up Instagram Webhooks" — *"Your app must be Live to receive notifications for app users."*
- Docs: "Webhooks for Instagram Messaging" — *"Your app must be published, regardless of app review
  status, to receive webhooks."*
- Hilo de comunidad (mismo sintoma, fix de Messenger -> Instagram Settings):
  `developers.facebook.com/community/threads/1987928951807903`
