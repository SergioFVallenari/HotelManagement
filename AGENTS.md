# AGENTS.md — Contexto del proyecto gestionHotel

## 1. Qué es

Sistema de gestión hotelera **multi-tenant** (multi-empresa). Web SPA + app Android + API REST + PostgreSQL.
UI, código y mensajes de error en **español** (los archivos son UTF-8 real; lo que se ve raro en la
terminal de Windows es la consola, no el código). Moneda ARS, zona horaria `America/Argentina/Buenos_Aires`.

## 2. Layout

```
backend/    API REST (Express + Prisma) — tsconfig strict, ESM NodeNext
frontend/   SPA React + app Android (Capacitor) — tsconfig SIN strict
plan-mercadopago.txt   plan de pagos online (YA IMPLEMENTADO)
security-plan.txt      plan de seguridad (PENDIENTE)
```

`backend/pnpm-workspace.yaml` **no** declara un monorepo: solo es el `allowBuilds` de pnpm 11 para
`prisma`/`@prisma/engines`/`esbuild` (y `@scarf/scarf: false`, un build de telemetría que trae
`swagger-ui-dist` de forma transitoria y que conviene no habilitar). Backend y frontend son paquetes
independientes con lockfiles propios; se instalan y compilan por separado.

## 3. Stack

- **backend**: Node 22 · TypeScript 7.0.2 (ESM, `strict`) · Express 5.2.1 · Prisma 7.10.0 (driver
  adapter `pg` 8.23) · Zod 4.6.5 · jsonwebtoken 9 · `@supabase/supabase-js` 2.117 (Auth/GoTrue) ·
  SDK `mercadopago` 3.6.1 · swagger-ui-express 5 (UI de `GET /api/docs`) · `node:test`.
- **frontend**: React 19.3 · Vite 8.3 · TypeScript 6.0 (sin `strict`) · Bootstrap 5.3 ·
  react-router-dom 7 · recharts 3 · @tabler/icons-react · Capacitor 8.5.2 · oxlint.

**No hay**: Redux/Zustand (el estado global es solo `AuthContext`), axios (wrapper `fetch` propio en
`src/api/client.ts`), librería de fechas, framework de tests, ESLint ni Prettier.

## 4. Comandos

```bash
# backend (cwd: backend/)
pnpm install
pnpm prisma:generate     # OBLIGATORIO antes de typecheck/build en un clone nuevo
pnpm dev                 # tsx watch src/server.ts
pnpm typecheck           # tsc --noEmit
pnpm test                # tsc -p tsconfig.test.json + node --import tsx --test tests/*.test.ts
pnpm build               # tsc -> dist/
pnpm prisma:migrate / prisma:deploy / prisma:studio / db:seed

# un solo archivo de test
pnpm exec node --import tsx --test tests/money.test.ts

# E2E manual de aislamiento multi-tenant (espera el server en :3100)
node e2e-multitenant.mjs

# prueba de carga (autocannon, devDependency). Espera el server en :3100
pnpm bench                 # rampa de conexiones sobre 4 endpoints de solo lectura
pnpm bench:drop            # purga los datos con tag BENCH (no se puede por REST)

# frontend (cwd: frontend/)
pnpm dev / build / lint   # build:mobile = tsc -b && vite build && cap sync android
pnpm android:open / apk   # apk = gradlew.bat assembleDebug (solo Windows)

# deploy
bash backend/deploy.sh   # ver gotcha 8
bash backend/up-all.sh / down-all.sh / db-up.sh / db-down.sh / nat-setup.sh
```

`src/generated/` (el client de Prisma) está en `backend/.gitignore`: sin `prisma:generate` el
`typecheck` falla por imports rotos, no por errores de tipos.

El orden que importa es el de `deploy.sh`: `prisma generate → typecheck → test → build → docker
build/push → lambda update → sync env → migrate deploy → smoke /health → build frontend → s3 sync →
cloudfront invalidation → smoke del bundle`. El frontend se buildea **sin `lint`** (ver gotcha 8).

## 5. Dominio y datos

16 modelos: `Company`, `User`, `UserCompany`, `UserType`, `RoomType`, `Room`, `Guest`, `Service`,
`Reservation`, `ReservationService`, `Payment`, `CompanyMpAccount`, `ChannelAccount`,
`ChannelConversation`, `ChannelMessage`, `CompanyAiSetting`. 9 enums. 28 migraciones en
`backend/prisma/migrations/`.

- **Mensajería de canales (omnicanal, genérico)**: `ChannelAccount` es la conexión/credenciales de un
  canal de la empresa (`@@unique([companyId, channel])`, tokens cifrados, `status`, `metadata Json`);
  `ChannelConversation` es un hilo con un contacto externo (`@@unique([accountId, externalThreadId])`,
  `unreadCount`, `lastMessageAt/Preview`, `lastInboundAt`); `ChannelMessage` tiene
  `externalMessageId` **único** (idempotencia del webhook) y `attachments Json`. Enums `ChannelType`
  (`INSTAGRAM`/`FACEBOOK`/`AIRBNB`), `ChannelAccountStatus`, `ChannelDirection`, `ChannelMessageStatus`
  y `ChannelContentType`. Reemplazó a `InstagramIntegration` (migración
  `20261019120000_channel_messaging`, que copia los datos existentes y activa RLS en las 3 tablas).
  Solo Instagram tiene adaptador y endpoints hoy; Facebook/Airbnb son valores de enum reservados.

- **Asistente de IA de la bandeja (Gemini)**: `CompanyAiSetting` es 1:1 con `Company` (PK
  `companyId`): `enabled` (default off), `autoReply` (default on), `instructions Text?`. La API key
  es **global por backend** (`GEMINI_API_KEY` en env, ver §9) y la config por empresa vive en la
  tabla; sin key el backend arranca igual y los endpoints de IA responden 503 `AI_NOT_CONFIGURED`.
  Modo híbrido: el webhook de canales llama `maybeAutoReply` en fire-and-forget después de ingerir
  (el 200 a Meta no espera a Gemini) y solo auto-responde si la respuesta sale con `action: "auto"`;
  lo demás queda como borrador vía `POST /api/conversations/:id/ai/draft` (botón ✨ del composer).
  Guardas: `enabled && autoReply` · cuenta `ACTIVE` · ventana 24 h abierta · el último mensaje de la
  conversación es un IN con texto (anti-loop). El parser (`ai.reply.ts`) cae **siempre** en
  `suggest` ante cualquier respuesta ilegible; un fallo de Gemini jamás rompe la ingesta.

- `ReservationStatus`: `PENDING → RESERVED → CHECKED_IN → CHECKED_OUT` (o `CANCELLED`).
- `UserRole`: `ADMIN`, `RECEPCIONISTA`. `PaymentMethod`: `CASH`, `CARD`, `TRANSFER`, `MERCADOPAGO`.
- `ServiceChargeType`: `PER_PERSON` (× personas × noches), `PER_DAY` (× noches), `PACK` (cantidad fija).
- **Importes siempre `Decimal(10,2)` en DB — nunca `float`.** En elTS son `number`: por eso todo
  pasa por `decToNum`/`round2` de `lib/money.ts`.
- Código de reserva: `RSV-<base36 fecha><4 aleatorios>`.
- `refundEligible` solo si hay ≥10 días hasta el check-in y monto pagado > 0.
- `checkIn`/`checkOut` son `Date` a medianoche **UTC** (`@db.Date`). Toda la aritmética de fechas
  usa UTC; la zona del hotel solo aparece para calcular "hoy" (`todayHotel()` en `lib/date.ts`).
- **Anticipo al crear**: `POST /api/reservations` acepta `payment: { amount, method, reference }`. El
  método decide el camino:
  - `CASH|CARD|TRANSFER` registra el pago en la **misma transacción** que la reserva (el backend
    rechaza un anticipo mayor al total) y, si además llega `generatePaymentLink`, la orden de MP se
    genera solo por el **saldo** (`total - anticipo`); si el anticipo cubre el total, no se genera
    orden y la reserva nace `RESERVED`.
  - `MERCADOPAGO` **no** registra el pago: la orden se genera por el monto del anticipo (típico 15%
    de seña), la reserva nace `PENDING` y el saldo restante se cobra en el hotel. En este camino
    `generatePaymentLink` se ignora porque la orden siempre se genera.
- `POST /api/reservations/:id/mp/order` cobra el **saldo pendiente** (`outstandingBalance` =
  `total - todos los pagos`, así que descuenta también lo pagado por MP), no el total, y falla con
  `INVALID_STATE` si no queda nada por cobrar. Acepta `{ regenerate: true }` para pisar el link.
- El webhook valida el importe contra `Reservation.mpExpectedAmount` (el monto que se le pidió a
  MP). En las reservas anteriores a `20260926120000_mp_expected_amount`, que no tienen ese campo,
  espera el total completo y loguea un warning (`mp.webhook.ts:147`).
- **Identidad global + membresías**: `User` es **global** (una fila por persona): `email` único,
  `authUserId` único (linkea con `auth.users.id`), `name` propio. **No tiene** `companyId`,
  `username`, `typeId`, `isActive` ni `createdById`. La pertenencia a un hotel vive en
  `UserCompany` (`@@id([userId, companyId])`, `@@unique([companyId, username])`): `username`,
  `typeId` (rol) e `isActive` son **por hotel**, y `createdById` apunta al OWNER que lo dio de
  alta. Un mismo auth user puede tener N membresías (una por empresa) sobre la misma fila `User`.
- **Credenciales en Supabase Auth** (schema `auth`, tabla `auth.users`): `User.passwordHash` **no
  existe** y `User.email` es `NOT NULL` (la identidad de login). El trigger `public.sync_auth_user()`
  (migración `20261016140000_supabase_auth`, trigger reescrito en
  `20261017140000_user_company`) crea la fila de app cuando el email queda confirmado: upsertea
  `User` por `authUserId`; si la metadata trae `company_id` es alta interna (la empresa ya existe y
  la elige el backend) y crea la membresía `UserCompany` idempotente, si no crea `Company` +
  `UserType` OWNER + `User` + membresía (auto-registro, con `createdById` = el propio OWNER).
  El rol, el hotel y el `created_by_id` **solo** salen de la metadata que arma el backend
  (`modules/auth/auth.metadata.ts`), nunca del cliente. Ver §7.

## 6. Arquitectura backend

Modular por dominio en `src/modules/*` → `archivo.controller.ts` / `.routes.ts` / `.schema.ts`.
Solo `reservations`, `channels` y `ai` tienen `service.ts` (el de `channels` es la ingesta del webhook y el
inbox). El módulo `channels` es la capa genérica de mensajería: `adapters/` aísla lo específico de
cada proveedor; `channels.registry.ts` mapea `ChannelType` → adapter y hoy solo Instagram está
registrado. `channels.controller.ts` expone `createWebhookHandler(channel)` (firma HMAC + `rawBody`,
responde 403/200) y los handlers del inbox. El módulo `ai` es el asistente de la bandeja:
`ai.client.ts` llama a Gemini (`generateContent` + `responseSchema`, header `x-goog-api-key`, timeout
15 s, 3 intentos con backoff corto ante 429/503), `ai.prompt.ts`/`ai.reply.ts` son funciones puras (prompt con
servicios+precios del hotel, parser con fallback a `suggest`), `ai.service.ts` tiene `generateDraft`
y `maybeAutoReply`. El módulo `realtime` expone `GET /api/realtime/config`
(`lib/realtime.ts`: firma el JWT de Supabase Realtime con el claim `company_id`); el frontend se
suscribe al canal privado de la empresa y escucha `postgres_changes` sobre las tablas de canales,
así la bandeja funciona sin polling (el broadcast REST se eliminó).

- **Multi-tenancy**: `src/lib/tenant.ts` (AsyncLocalStorage) + query extension de Prisma en
  `src/config/prisma.ts` que inyecta `companyId` automáticamente. `requireAuth` llama
  `withTenant(companyId, next)`, así que todo lo que corre después ya está scopeado.
  `SCOPEABLE_MODELS` = `UserCompany`, `RoomType`, `Room`, `Guest`, `Service`, `Reservation`,
  `ChannelAccount`, `ChannelConversation`, `ChannelMessage`, `CompanyAiSetting`. **Exentos** (se aíslan por relación o no tienen `companyId`): `Company`,
  `UserType`, `Payment`, `ReservationService`, `CompanyMpAccount`. `User` es global: no se scopea.
  El scope también cubre `create`/`upsert` (inyecta `companyId` si falta) y agrega un **segundo
  `AND`** a los `where` de las listas — un `OR` del caller no se rompe.
- **Envelope**: éxito `{ data, meta? }` · error `{ error: { code, message, details? } }`.
- **60 endpoints** bajo `/api` + `/health`. Públicos: `/health`, `login`, `login/company`,
  `logout`, `GET /api/mp/oauth/callback`, `POST /api/mp/webhook`,
  `POST /api/auth/register`, `POST /api/auth/resend-confirmation` (auto-registro de hotel: crea una
  **Company nueva + usuario `OWNER`** vía el trigger de Supabase; ambas rutas llevan
  `rateLimiter(5, 15min)` y, si `REGISTER_KEY` está seteada, exigen `key` en el body — ver
  §9). También públicos a propósito: `GET /api/docs` (Swagger UI) y `GET /api/docs.json`
  (spec OpenAPI 3.1), servidos por `src/docs/` (`openapi.ts` arma la spec en runtime desde
  los Zod de `docs/schemas.ts` y los `.schema.ts` de cada módulo vía `z.toJSONSchema`;
  no hay un archivo YAML commiteado). `GET /api/companies` exige `requireAuth`.
- **Validación**: solo Zod, y solo en los `.schema.ts`. `errorHandler` mapea `AppError`,
  `ZodError` → 400, `P2002` → 409, `P2025` → 404.
- **Logging de errores del backend**: prefijo `[mp]`, `[http]`, `[GH]`, `[users]`, `[channels]`,
  `[realtime]`. Cuando agregues un módulo, seguí esa convención.

## 7. Auth

Login en **2 pasos**: `POST /api/auth/login` (email+pass, validado contra Supabase Auth) devuelve
las empresas del usuario **y un access token de Supabase** → `POST /api/auth/login/company`
(`companyId` + `token`) valida el token con `auth.getUser()` y emite la sesión.

- **Las credenciales viven en Supabase Auth, no acá.** `lib/supabaseAuth.ts` es el único cliente
  GoTrue y usa la **service_role key** server-side (la anon key nunca sale del backend). `bcryptjs`,
  `lib/mailer.ts`, `modules/users/users.code.ts` y la tabla `EmailVerificationCode` se eliminaron:
  ya no hay hashes propios ni código de 6 dígitos. La confirmación de email la hace Supabase
  (*Confirm email* ON, SMTP configurado en el dashboard, no en el backend).
- La identidad de login es el **email** (`User.email` NOT NULL). `username` es **por hotel**
  (vive en `UserCompany`, único por empresa). El JWT lleva `id` = `User.id` **global**,
  `username` y `role` de la membresía elegida, y `companyId` = hotel activo. `POST /api/users`
  sigue exigiendo contraseña, pero si el email ya tiene cuenta (en otra empresa) se reutiliza
  esa cuenta y la contraseña se ignora.
- `loginForCompanies` lista las membresías activas (`UserCompany`) del auth user; `isOwner` es
  si alguna es `OWNER` y `ownedCompanies` se calcula por `createdById = user.id`. `switchCompany`
  y el payload del JWT toman `username`/`role` de la membresía destino, no de `User`.
- JWT en **cookie httpOnly `gh_token`** — nunca en header `Authorization` ni en `localStorage`.
  `secure` + `sameSite:'none'` en prod, `lax` en dev. Expiración por `JWT_EXPIRES_IN` (default 12h);
  `authCookieOptions()` parsea ese string a `maxAge` con un regex propio.
- Middlewares: `requireAuth` (401) y `requireAdmin` (403, solo `ADMIN`).
- Frontend: `credentials:'include'` en todas las requests; un 401 dispara el evento global
  `auth:expired` que `AuthContext` escucha para limpiar la sesión.
- El enforcement de rol en el frontend es **solo UI**; la seguridad real está en el backend.

## 8. Infra AWS (`us-east-2`) + Supabase

| Recurso | Nombre |
|---|---|
| Lambda (ECR) | `gestion-hotel-backend` (Function URL, puerto 8080 vía Lambda Web Adapter) — **fuera de la VPC** (red default de AWS, egress nativo; no necesita NAT) |
| PostgreSQL | **Supabase** (project-ref `zbdonqyykuaohvneuhzb`): pooler transaccional `:6543` en runtime y session `:5432` (`DIRECT_URL`) para la CLI de Prisma |
| Auth | **Supabase Auth (GoTrue)** en el mismo proyecto — `auth.users` + trigger hacia `public."User"` |
| RDS PostgreSQL | `db-hotelmanagement` — **detenido**; quedó reemplazado por Supabase (borrar es decisión futura) |
| S3 + CloudFront | `hotel-frontend-305424` / `E2155UKYS18LH3` |

La **NAT EC2 `hotel-nat`, su EIP, la SG `lambda-sg` y la ruta 0.0.0.0/0 de la route table se
eliminaron** el 2026-10-19: la Lambda salió de la VPC y ya no las necesita. La Function URL
tiene resource policy explícita (`FunctionUrlAllowPublicAccess` + `FunctionUrlAllowInvoke`,
principals `*`); si se pierde, las requests devuelven 403 con `AuthType: NONE` — repone con
`aws lambda add-permission` (los dos statement ids, ver plan de migración).

La URL de la Lambda y la de CloudFront están **hardcodeadas** en `backend/deploy.sh` y en los
defaults de `config/env.ts` (`LAMBDA_URL`, `CLOUDFRONT_URL`). Si cambian, hay que tocar los dos.

`deploy.sh` migra contra Supabase con `DIRECT_URL` (`prisma migrate deploy`); el **túnel SSH por la
NAT se eliminó** porque el RDS ya no es la base activa. `DATABASE_URL` es el pooler transaccional de
Supabase con `ssl` activo salvo host local (`isRemoteHost()` en `config/prisma.ts`), y el pool del
runtime está acotado (`max: 5`, en `config/prisma.ts`).

El **sync de env** de `deploy.sh` toma `.env.production` como fuente de verdad, lo mergea sobre lo
que ya corre en la Lambda y solo actualiza si algo cambió de verdad (cambiar la config de una
Lambda en VPC le hace recrear los ENIs). Claves vacías **no** borran la existente; `PORT` se saltea.

## 9. Variables de entorno (solo nombres)

**Backend**: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`,
`HOTEL_TZ`, `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY`, `MP_WEBHOOK_SECRET`,
`MP_REDIRECT_URI`, `MP_NOTIFICATION_URL`, `MP_APP_URL`, `MP_SITE_URL`, `MP_API_URL`,
`MP_TEST_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
`SUPABASE_JWT_SECRET`, `REGISTER_KEY`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
`INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_FRONTEND_URL`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_URL`.

- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (`env.ig.webhookVerifyToken`) es el que valida el `hub.verify_token`
  del `GET /api/integrations/instagram/webhook`; el `POST` valida la firma HMAC con
  `INSTAGRAM_APP_SECRET`. `INSTAGRAM_REDIRECT_URI` tiene que coincidir tal cual con la app de Meta.
- Todo pasa por `config/env.ts` **excepto `HOTEL_TZ`**, que se lee directo de `process.env` en
  `lib/date.ts` y por eso no figura en `.env.example`.
- `MP_NOTIFICATION_URL` se manda como `config.online.callback_url` de cada orden: es la URL a la que
  MP notifica. En dev puede apuntar a un túnel (`ngrok http 3000`, nunca a 5173).
- `MP_TEST_ACCESS_TOKEN` es solo de dev: si está cargado, las órdenes se crean con ese token y no
  hace falta OAuth. En producción se ignora por completo.
- `MP_WEBHOOK_SECRET` es **obligatorio en producción**: sin él el webhook responde 500 y no confirma
  pagos. En dev el webhook **no valida la firma** en absoluto si falta.
- `MP_REDIRECT_URI` tiene que estar registrada carácter por carácter en la app de MP.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` son **obligatorias** (`required()` en `config/env.ts`):
  sin ellas el backend no arranca. El valor tiene que ser la **secret key** (`sb_secret_...`) o el
  JWT legado `service_role`; la **publishable** (`sb_publishable_...`) sirve para el navegador y
  autentica login/registro, pero la Admin API la rechaza con `401 no_authorization`. `SUPABASE_ANON_KEY`
  es la clave pública que el backend reenvía al frontend en `GET /api/realtime/config` (no hay ningún
  `VITE_*` de Supabase: el frontend la recibe en runtime). Se cargan en `backend/.env` (dev) y
  `backend/.env.production` (sube el sync de `deploy.sh`).
- `SUPABASE_JWT_SECRET` es la **Legacy JWT Secret** (página *JWT Signing Keys* → sección homónima), el
  único secreto HS256 extraíble del proyecto; la signing key actual es asimétrica (ECC P-256) y su parte
  privada no se puede exportar, así que no sirve para firmar. Con el legacy secret el backend firma el
  JWT de Realtime (claim `company_id`) que autoriza el canal privado de la bandeja; la policy vive en
  `realtime.messages` (migración `20261019130000_realtime_authorization`). Mientras `SUPABASE_SERVICE_ROLE_KEY`
  siga siendo la key legacy `eyJ...`, el legacy secret **no se puede revocar** (Supabase exige deshabilitar
  `anon`/`service_role` antes), así que la dependencia es durable. Es **opcional**: si falta,
  `/api/realtime/config` responde 503 `REALTIME_DISABLED` y la bandeja usa el polling de respaldo (5 min).
- `GEMINI_API_KEY` (opcional): la key de Google AI Studio del asistente de la bandeja. Sin ella el
  backend arranca igual: `/api/ai/config` responde `configured: false`, los drafts devuelven 503
  `AI_NOT_CONFIGURED` y el auto-reply queda inactivo. `GEMINI_MODEL` (default `gemini-3.5-flash`) y
  `GEMINI_API_URL` (default `https://generativelanguage.googleapis.com/v1beta`) son opcionales. Va
  en `.env` (dev) y en `.env.production` para que la suba el sync de `deploy.sh`.
- `REGISTER_KEY` (vacía = registro abierto): cuando está seteada, `/auth/register` y
  `/auth/resend-confirmation` exigen `key` en el body (403 `REGISTER_KEY_REQUIRED`, comparación
  timing-safe en `auth.routes.ts`). Se coordina con `VITE_ALLOW_REGISTER` del frontend: **cerrado** =
  key puesta + flag off (la UI no aparece y la API exige secreto); **abierto** = key vacía + flag on.
  La key no puede ir al frontend (`VITE_*` es público en el bundle).

**Frontend**: `VITE_URL_BACKEND` (en `src/api/client.ts`) y `VITE_ALLOW_REGISTER` (en
`pages/LoginPage.tsx`; `"true"` muestra el botón "Crear usuario" + offcanvas de registro, default
oculto). Ambas documentadas en `frontend/.env.example`.

**Seed** (`backend/prisma/seed.ts`): crea las cuentas con la Admin API de Supabase (`email_confirm:
true`) y deja la fila de app por el trigger — `admin@hotelprincipal.test/admin123` y
`recepcion@hotelprincipal.test/recepcion123` (Hotel Principal), `sol@hotelsol.test/admin123`
(Hotel Sol). Es idempotente: si la cuenta ya existe reutiliza su `authUserId`. El seed de
habitaciones/servicios sigue comentado a propósito.

## 10. Gotchas

1. **`.gitignore` raíz**: ignora `*.sh` y `android/`, pero des-ignora explícitamente
   `!backend/deploy.sh`, `!backend/nat-setup.sh` y `!frontend/android/`. Los helpers de dev
   (`up-all.sh`, `db-up.sh`, `down-all.sh`, `db-down.sh`) **siguen ignorados a propósito** — son
   regenerables. Los tres des-ignorados están **sin commitear todavía** (`??` en `git status`): hasta
   que se commiteen, un clone nuevo no los tiene de verdad.
2. **`frontend/.env.example` documenta las dos variables del frontend** (`VITE_URL_BACKEND` y
   `VITE_ALLOW_REGISTER`), pero `.env*` sigue ignorado: en un clone nuevo hay que crear
   `frontend/.env` a mano (copiando el ejemplo), si no `VITE_URL_BACKEND` queda `undefined` y el
   fetch falla contra `undefined/api`.
3. `build:mobile` corre `vite build`, que usa mode `production` → carga **`frontend/.env.production`**
   (la URL de la Lambda), no el `.env` de dev. El APK sí apunta a producción, y Android no declara
   `usesCleartextTraffic`: para algún día buildear contra `http://localhost:3000` habría que pasarlo
   a `.env.production` y agregar `usesCleartextTraffic` (o una `network_security_config.xml`).
4. El proxy `/api` de `vite.config.ts` existe pero **no se usa**: el client llama a URL absoluta.
5. `parseIdParam` (`lib/pagination.ts`) lanza un `Error` genérico → el `errorHandler` no lo reconoce
   y un id inválido devuelve **500** en lugar de 400.
6. `BrowserRouter` servido desde S3/CloudFront sin *error document* declarado → riesgo de 404 en
   rutas profundas (`/reservations`, `/settings`). `frontend/public/` solo tiene los íconos.
7. `LoginPage.tsx` muestra credenciales de prueba hardcodeadas en la UI (`login-hint`).
8. **Sin CI.** `deploy.sh` corre `typecheck` + `test` del backend, pero el frontend se buildea sin
   `lint`. Los helpers de infra tampoco corren `lint`.
9. **MercadoPago / firma del webhook** — dos trampas de la doc resueltas en `mp.signature.ts`:
   (a) el manifest exige el `data.id` **en minúsculas** cuando es alfanumérico en mayúsculas
   (`ORDTST01...` → `ordtst01...`) y el SDK no lo hace; (b) MP manda `ts` en **milisegundos** y el
   SDK asume segundos, por eso la tolerancia (5 min) se chequea a mano y no con `toleranceSeconds`.
   `MP_WEBHOOK_SECRET` es la clave que genera MP en *Tus integraciones → tu app → Webhooks >
   Configurar notificaciones*; no es `MP_CLIENT_SECRET` ni una autogenerada. Tiene que ser la de la
   **misma app** que firma: las credenciales de **prueba** de una app tienen su propio
   `application_id` (el token `APP_USR-<otroId>-…` lo delata). Si `MP_TEST_ACCESS_TOKEN` es de otra
   app que `MP_APP_ID`, el webhook llega igual pero la firma no valida.
10. **Riesgo residual conocido**: en `createReservation` la orden de MP se crea *fuera* del
    `$transaction` (`reservations.service.ts:265`). Hay un pre-check de conflicto de habitación para
    que el fallo más común no deje una orden viva, pero la ventana de carrera sigue abierta: si la
    reserva falla, la orden queda viva y el huésped puede pagar una reserva que no existe.
    Recuperable desde `POST /api/reservations/:id/mp/order`, no compensado automáticamente.
11. `Reservation.mpOrderId` es **único**: hay una sola orden por reserva. Regenerar el link pisa la
    orden anterior y una notificación de la orden vieja ya no encuentra la reserva (warning, el pago
    no se registra). No aplicar mientras el saldo restante se cobre en el hotel.
12. `Payment.reference` es `@unique` y es la **idempotencia** del webhook: un pago repetido con la
    misma `data.transactions.payments[].id` no se duplica.
13. `lib/money.ts:resolveAmount` acepta el importe en **decimal o en centavos** (MP es inconsistente)
    y devuelve `format: 'unknown'` cuando no matchea — el webhook **registra el pago igual** y solo
    loguea un warning. No es un rechazo.
14. **Supabase / trigger `sync_auth_user`**: el trigger solo corre en `AFTER INSERT` (con
    `email_confirmed_at` ya seteado) o en la transición de no-confirmado → confirmado. Un usuario
    creado por la Admin API **sin** `email_confirm: true` **no genera fila de app**, y el login
    responde 401 como si la contraseña estuviera mal. `sync_auth_user` es `SECURITY DEFINER` con
    `search_path=''` porque GoTrue escribe como `supabase_auth_admin`, que sin RLS-bypass no puede
    tocar las tablas de app; el `postgres` del pooler es dueño de las tablas y de `TRIGGER` sobre
    `auth.users`, así que le alcanza.
15. **Multi-empresa = N filas de app por auth user**: `User` es global y `authUserId` es único,
    así que un mismo email reutiliza la misma fila `User` en todas las empresas. El rol, el
    `username` y el `isActive` viven en `UserCompany`. `users.controller.ts` hace el lookup
    cross-tenant del `User` con `unscoped(...)`: sin eso el scope de tenant esconde las filas de
    las otras empresas y `createUser` intenta crear la cuenta de nuevo en GoTrue.
16. **`pnpm db:seed` va por la Admin API**: necesita `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
    válidas y la migración aplicada. Si la key es vieja o es de otro proyecto, el backend arranca
    (solo valida que existan) pero el seed falla y el login de prueba responde `AUTH_ERROR` (500).
    Si es la **publishable** (`sb_publishable_...`) el síntoma es distinto: login y registro andan
    (son endpoints públicos de GoTrue) pero el seed y `POST /api/users` fallan con 500 porque la
    Admin API devuelve `401 no_authorization`.
17. **Webhook de canales / firma sobre el raw body**: `express.json({ verify })` en `app.ts` guarda
    `req.rawBody`; la firma HMAC de Meta se calcula sobre esos bytes, no sobre `JSON.stringify(req.body)`
    (que los reordena y rompe el hash). Firma inválida → **403**, el resto → **200** (Meta reintenta).
    El `writeRateLimiter` exime los paths que terminan en `/webhook` por el mismo motivo.
18. **Echo de Instagram**: un mensaje saliente propio vuelve por el webhook con `is_echo: true`; se
    persiste como `OUT` con el participante = `recipient.id` y, si el `mid` ya existe (ya lo guardamos
    al enviar), el `P2002` de `externalMessageId` lo descarta. La **ventana de 24 h** se calcula sobre
    `lastInboundAt`; pasada la ventana el composer se bloquea y `sendMessage` responde 409
    `CHANNEL_WINDOW_EXPIRED`.
19. **RLS de las tablas de canales**: `ChannelAccount`, `ChannelConversation` y `ChannelMessage` nacen
    con `ENABLE ROW LEVEL SECURITY` (la migración `20261019120000_channel_messaging`). El backend entra
    como `postgres` (dueño, con bypass), pero el aislamiento real entre empresas lo hace el scope de
    `companyId`, no RLS.
20. **Realtime de la bandeja**: el frontend se suscribe al canal privado `company:<id>` con un JWT
    firmado por el backend (claim `company_id`, lo entrega `GET /api/realtime/config`) y escucha
    `postgres_changes` sobre `ChannelMessage` (INSERT) y `ChannelConversation` (INSERT/UPDATE) con
    `filter: companyId=eq.<id>`. La autorización de `postgres_changes` es la **RLS de las propias
    tablas**, no la de `realtime.messages`: las policies SELECT por `company_id` y el alta en la
    publicación `supabase_realtime` están en la migración `20261019140000_realtime_postgres_changes`
    (las tablas nuevas no entran solas a la publicación; los guards la hacen idempotente). Hacen
    falta **tres** migraciones de grants, porque el proyecto no tiene los default grants de Supabase
    en `public`: `20261019150000_channel_realtime_grants` (`GRANT SELECT` de las dos tablas a
    `authenticated`) y `20261019160000_public_schema_usage` (`GRANT USAGE ON SCHEMA public`). Sin
    ambos, la evaluación RLS de Realtime falla con `42501` y **descarta los eventos en silencio**
    (el join responde `SUBSCRIBED` y hasta `Subscribed to PostgreSQL` llega ok, pero no llega ningún
    evento: los payloads quedaban `{}` antes del grant de tablas, y cero mensajes antes del grant de
    esquema). Al crear tablas nuevas para realtime, repetir los dos grants. Para el
    join del canal privado sigue vigente la policy de `realtime.messages`
    (migración `20261019130000_realtime_authorization`); nunca agregar
    `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`: falla con `42501` y aborta la
    migración (ya tiene RLS). **No suscribirse a eventos DELETE**: RLS no se aplica a DELETE en
    `postgres_changes`. `useRealtime` devuelve `connected: false` si falta `SUPABASE_JWT_SECRET`
    (config 503) o si el canal no está `SUBSCRIBED`; en ese caso la bandeja hace polling de
    respaldo de **5 min** y reintenta el join al volver a la pestaña. Para diagnosticar realtime
    conviene `config.postgres_changes_options = { wait: true }`: el `SUBSCRIBED` recién se emite
    cuando el server confirma la suscripción real y, si falla, el motivo viene en el error
    (`RealtimeDisabledForConfiguration`, `PostgresChangesSubscribeTimeout`). El sync de Instagram
    quedó **solo manual** (botón con ícono de refresh en la bandeja: no hay intervalo automático ni
    sync al montar/focus).
21. **Conversations API de IG (sync/historial)**: `POST /api/integrations/instagram/sync` pide
    `GET /me/conversations?platform=instagram` e importa solo el **último mensaje por conversación**
    (sin marcar no leídos ni emitir Realtime; el frontend refresca tras la respuesta);
    `POST /api/conversations/:id/history` importa los últimos 20 **solo a pedido** (el frontend ya
    no lo llama al abrir el hilo: el hilo arranca desde `connectedAt` de la cuenta). El filtro por
    `connectedAt` se aplica en dos capas: `ingestEvents` descarta mensajes con `sentAt <
    connectedAt` (webhook, sync e history pasan por ahí) y `listMessages` filtra el thread; la
    migración `20261019170000_purge_preconnect_messages` purgó lo importado antes de conectar y
    recalculó `lastMessageAt`/`lastMessagePreview`/`lastInboundAt`. El id externo de la
    conversación se guarda en `ChannelConversation.metadata.externalConversationId` (sin migración).
    Esta API devuelve `data: []` mientras la app de Meta está en Development/Standard Access: hace
    falta poner la app en **Live** y (para DMs de terceros) Advanced Access de
    `instagram_business_manage_messages`. El parser puro vive en
    `adapters/instagram.conversations.ts` (testeado sin red). Los importes de historial viajan con
    `unread: false` y no pueden retroceder `lastMessageAt`/`lastInboundAt`. El `mid` del webhook
    puede no coincidir con el `id` de la Conversations API: si aparecen duplicados, deduplicar por
    conversación + dirección + fecha + texto.
22. **Suscripción al webhook de IG**: conectar la cuenta por OAuth llama a `POST /me/subscribed_apps`
    (Instagram Login) para suscribir la cuenta a `messages,messaging_seen`; desconectar la desuscribe.
    Ambas son **best-effort** (un fallo no rompe el flujo). La config a nivel app (URL del webhook +
    verify token) sigue siendo manual en el dashboard de Meta.

## 11. Tests

`node:test` puro, sin framework, sin DB. 12 archivos de test, 120 tests:

| Archivo | Cubre |
|---|---|
| `tests/money.test.ts` | `resolveAmount` (decimal/cents/desconocido), `clampAmount` |
| `tests/mp-order.test.ts` | `buildOrderPayload`, `outstandingBalance` |
| `tests/mp-return-to.test.ts` | `resolveReturnTo` / `buildReturnUrl`, allowlist del `returnTo` |
| `tests/mp-webhook-signature.test.ts` | `buildManifestDataId`, `readSignatureTs`, `toEpochMs`, tolerancia |
| `tests/validate.test.ts` | `isEmail` |
| `tests/auth-metadata.test.ts` | `buildSelfServiceMetadata` / `buildInternalMetadata` (qué metadatos ve el trigger) |
| `tests/instagram-auth.test.ts` | `signOauthState` / `verifyOauthState`, `buildAuthorizeUrl`, `IG_SCOPES`, `IG_WEBHOOK_FIELDS`, `buildSubscribeUrl` / `buildUnsubscribeUrl` |
| `tests/channels-instagram.test.ts` | parseo del payload de IG, echo, read, adjuntos, `mapAttachmentType`, firma HMAC |
| `tests/channels-conversations.test.ts` | parser de la Conversations API (`toIgDate`, conversaciones, mensajes, adjuntos, `reply_to`, URLs) |
| `tests/realtime.test.ts` | `realtimeTopic`, `signRealtimeToken` (claims `company_id`/`aud`/`exp`), `realtimeEnabled` |
| `tests/ai-prompt.test.ts` | `buildSystemPrompt` (hotel, servicios+precios, charge types, instrucciones), `buildUserTurns` (orden, límite 20, adjuntos) |
| `tests/ai-reply.test.ts` | `parseAiReply` (JSON válido, fences, JSON embebido, acción inválida, fallback `suggest`, truncado) |
| `tests/openapi.test.ts` | spec OpenAPI 3.1 de `src/docs/openapi.ts`: cobertura método+path contra los routers de `app.ts` (regex), `security` pública/sesionada, status HTTP válidos, `$ref` que resuelven |

> Si agregás un endpoint a un router y no lo documentás en `src/docs/openapi.ts`, el test de
> cobertura de `tests/openapi.test.ts` falla (y viceversa: una operación documentada debe existir).

Solo se testean funciones puras extraídas a módulos sin dependencias de Prisma. Si agregás lógica de
negocio, extraela a `mp.order.ts` / `money.ts` / `date.ts` y testéala ahí en vez de montar la app.

`bench.mjs` **no** es un test: no corre en `pnpm test` ni en `deploy.sh`, porque es lento y golpea la
DB. Corre solo a pedido y mide throughput/latencia, no correctitud.

## 12. Prueba de carga

`bench.mjs` usa la Node API de `autocannon` (devDependency, así que el `pnpm install --prod` del
Dockerfile no la mete a la Lambda). Hace login de 2 pasos para sacar `gh_token`, siembra un dataset con
tag `BENCH`, corre una rampa `1,5,10,15,20,30,50` sobre `/health`, `/api/rooms`,
`/api/reservations` y `/api/summary`, e imprime req/s + percentiles de latencia.

Configurable por env: `BENCH_BASE` (default `http://localhost:3100`), `BENCH_EMAIL` (login de 2
pasos, default la cuenta del seed de Hotel Principal), `BENCH_PASS`, `BENCH_COMPANY`, `BENCH_RAMP`,
`BENCH_DURATION`, `BENCH_ROOMS`, `BENCH_RESERVATIONS`, `BENCH_P97_LIMIT`, `BENCH_SEED=0`.

Tres cosas que costaron figuring y conviene no volver a descubrir:

1. **La siembra reutiliza, no recrea.** El bench necesita filas de tamaño conocido, no filas nuevas, así
   que completa lo que falta y no acumula entre corridas. Todo lleva tag fijo (`BENCH`, `BENCH-` en
   numbers, `bench-` en emails) y no timestamp, justamente para poder reconocerlo después.
2. **`pnpm bench:drop` va por Prisma, no por REST.** No existe `DELETE /reservations/:id` ni
   `DELETE /api/guests/:id`, y cancelar una reserva deja la fila, cuyo FK bloquea el `DELETE` de la
   habitación. Es el único camino para purgar de verdad.
3. **`timeout` de autocannon está en segundos** (`httpClient.js` lo multiplica por 1000), aunque el
   default del objeto de opciones parezca milisegundos. `pipelines` en cambio ya viene en 1 por default
   en la Node API (el 10 que se ve en la documentación es el de la CLI).

Números de referencia (local, Postgres local, 40 habitaciones y 60 reservas): `/health` ~3000 req/s,
`/api/rooms` ~500-680, `/api/reservations` ~280-330, `/api/summary` ~170-400. Cero non-2xx, cero
timeouts hasta c=50. **El techo no es el pool sino el event loop**: el throughput se aplana en c=5-10 y
después la latencia crece linealmente con la concurrencia (a c=50, 522 req/s × 94.9 ms = 49.5 en vuelo,
que es exactamente Little's Law para 50 conexiones). El backend es un proceso Node de un solo hilo, así
que autocannon en la misma máquina le roba CPU y hay ruido de ±20%: mirá la forma de la curva y la
comparación entre escenarios, no los números absolutos.

## 13. Planes

- **`plan-mercadopago.txt`**: implementado por completo.
- **Mensajería omnicanal (Instagram)**: implementada — inbox unificado (`/api/conversations…`) +
  conexión OAuth de Instagram sobre `ChannelAccount` + ingesta por webhook + auto-suscripción
  (`POST /me/subscribed_apps`) + tiempo real con Supabase Realtime (canal privado +
  `postgres_changes`, reemplaza el polling; el sync a Meta quedó solo manual). Facebook/Airbnb
  quedan como valores de enum sin adaptador (ver §5, §6 y §10.20/21).
- **Asistente de IA de la bandeja (Gemini)**: implementada — modo híbrido (auto-respuesta para
  consultas simples + borrador para revisión), config por empresa (`CompanyAiSetting`, Ajustes) +
  borrador bajo demanda (botón ✨ en el composer) + auto-reply en fire-and-forget desde el webhook.
  API key global `GEMINI_API_KEY` (sin ella todo responde 503 controlado). Ver §5, §6 y §9.
- **`security-plan.txt`**: **pendiente**. F1 (costo $0): helmet, rate limit en login, CORS allowlist,
  JWT 2h con `issuer`/`audience`, delay anti-enumeración, morgan, `pnpm audit`. F2 (manual): mover
  `DATABASE_URL` y `JWT_SECRET` a Secrets Manager, cerrar el 5432 a la IP personal, IAM de solo-deploy.
  F3 (con costo): API Gateway HTTP API para rate limit global y dominio propio.

## Convenciones

- **Comentarios**: la regla es "sin comentarios", con excepciones ya asentadas — archivos shell
  (`deploy.sh`, `nat-setup.sh`), `Dockerfile`, `.env.example`, `seed.ts` y los `//` que explican un
  porqué no obvio (`mp.controller.ts`, `client.ts`, `SettingsPage.tsx`). Comentá el porqué, no el qué.
- Hay 3 `// eslint-disable-next-line react-hooks/exhaustive-deps` **muertos**
  (`ReservationDetail.tsx:95`, `ReservationForm.tsx:79,187`): el proyecto usa oxlint, no ESLint.
  No copy-pastees ese patrón.
- Nombres de archivo en camelCase; los módulos usan `.controller.ts` / `.routes.ts` / `.schema.ts` /
  `.service.ts`. Excepción: `components/pagination.tsx` (minúscula, es UI).
- Imports con **extensión `.js`** aunque el fuente sea `.ts` (ESM NodeNext en backend). Omitirla
  rompe el build.
- Lint: `pnpm lint` (oxlint) con `.oxlintrc.json` — `rules-of-hooks` es **error**, `only-export-
  components` es warn. Hoy pasa con 7 warnings y 0 errores; no los subas.
- Logout y demás acciones destructivas siempre con confirmación (`ConfirmDialog`).
- Ajustes de dinero: los cálculos viven en `lib/money.ts` (backend) y `lib/format.ts` (frontend);
  nunca reimplementar redondeo a mano.
- Mensajes de error, `code` de error y UI en español.
