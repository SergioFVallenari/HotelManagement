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
  adapter `pg` 8.23) · Zod 4.6.5 · jsonwebtoken 9 + bcryptjs 3 · SDK `mercadopago` 3.6.1 ·
  swagger-ui-express 5 (UI de `GET /api/docs`) · `node:test`.
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

12 modelos: `Company`, `User`, `UserType`, `RoomType`, `Room`, `Guest`, `Service`, `Reservation`,
`ReservationService`, `Payment`, `CompanyMpAccount`, `EmailVerificationCode`. 4 enums. 14 migraciones
en `backend/prisma/migrations/`.

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

## 6. Arquitectura backend

Modular por dominio en `src/modules/*` → `archivo.controller.ts` / `.routes.ts` / `.schema.ts`.
Solo `reservations` tiene `service.ts` (disponibilidad, totales, check-in/out, cancelación).

- **Multi-tenancy**: `src/lib/tenant.ts` (AsyncLocalStorage) + query extension de Prisma en
  `src/config/prisma.ts` que inyecta `companyId` automáticamente. `requireAuth` llama
  `withTenant(companyId, next)`, así que todo lo que corre después ya está scopeado.
  `SCOPEABLE_MODELS` = `User`, `RoomType`, `Room`, `Guest`, `Service`, `Reservation`. **Exentos**
  (se aíslan por relación o no tienen `companyId`): `Company`, `UserType`, `Payment`,
  `ReservationService`, `CompanyMpAccount`, `EmailVerificationCode`.
  El scope también cubre `create`/`upsert` (inyecta `companyId` si falta) y agrega un **segundo
  `AND`** a los `where` de las listas — un `OR` del caller no se rompe.
- **Envelope**: éxito `{ data, meta? }` · error `{ error: { code, message, details? } }`.
- **49 endpoints** bajo `/api` + `/health`. Públicos: `/health`, `login`, `login/company`,
  `logout`, `GET /api/mp/oauth/callback`, `POST /api/mp/webhook`,
  `POST /api/users/send-code`, `POST /api/users/register` (auto-registro de hotel: crea una
  **Company nueva + usuario `OWNER`**, con código de verificación por email; ambas rutas llevan
  `rateLimiter(5, 15min)` y, si `REGISTER_KEY` está seteada, exigen `key` en el body — ver
  §9). También públicos a propósito: `GET /api/docs` (Swagger UI) y `GET /api/docs.json`
  (spec OpenAPI 3.1), servidos por `src/docs/` (`openapi.ts` arma la spec en runtime desde
  los Zod de `docs/schemas.ts` y los `.schema.ts` de cada módulo vía `z.toJSONSchema`;
  no hay un archivo YAML commiteado). `GET /api/companies` exige `requireAuth`.
- **Validación**: solo Zod, y solo en los `.schema.ts`. `errorHandler` mapea `AppError`,
  `ZodError` → 400, `P2002` → 409, `P2025` → 404.
- **Logging de errores del backend**: prefijo `[mp]`, `[http]`, `[GH]`, `[users]`. Cuando agregues
  un módulo, seguí esa convención.

## 7. Auth

Login en **2 pasos**: `POST /api/auth/login` (user+pass) devuelve las empresas del usuario →
`POST /api/auth/login/company` (companyId+user+pass) emite la sesión.

- JWT en **cookie httpOnly `gh_token`** — nunca en header `Authorization` ni en `localStorage`.
  `secure` + `sameSite:'none'` en prod, `lax` en dev. Expiración por `JWT_EXPIRES_IN` (default 12h);
  `authCookieOptions()` parsea ese string a `maxAge` con un regex propio.
- Middlewares: `requireAuth` (401) y `requireAdmin` (403, solo `ADMIN`).
- Frontend: `credentials:'include'` en todas las requests; un 401 dispara el evento global
  `auth:expired` que `AuthContext` escucha para limpiar la sesión.
- El enforcement de rol en el frontend es **solo UI**; la seguridad real está en el backend.
- El login por empresa re-usa la contraseña que el usuario ya tíneo: el paso 1 compara el hash
  contra **cada** empresa donde coincide el username, así que el paso 2 re-valida. No refactorizar
  esto sin revisar el timing de enumeración (ver `security-plan.txt` F1).

## 8. Infra AWS (`us-east-2`)

| Recurso | Nombre |
|---|---|
| Lambda (ECR) | `gestion-hotel-backend` (Function URL, puerto 8080 vía Lambda Web Adapter) |
| RDS PostgreSQL | `db-hotelmanagement` — privado en VPC, solo el SG de la Lambda entra |
| NAT EC2 | `hotel-nat` — **salida a internet obligatoria para MercadoPago** |
| S3 + CloudFront | `hotel-frontend-305424` / `E2155UKYS18LH3` |

La URL de la Lambda y la de CloudFront están **hardcodeadas** en `backend/deploy.sh` y en los
defaults de `config/env.ts` (`LAMBDA_URL`, `CLOUDFRONT_URL`). Si cambian, hay que tocar los dos.

`deploy.sh` migra vía **túnel SSH por la NAT** (puerto local 15432 → 5432), porque el RDS no acepta
conexiones desde la máquina. `DATABASE_URL` apunta al RDS con `ssl` activo salvo host local
(`isRemoteHost()` en `config/prisma.ts`).

El **sync de env** de `deploy.sh` toma `.env.production` como fuente de verdad, lo mergea sobre lo
que ya corre en la Lambda y solo actualiza si algo cambió de verdad (cambiar la config de una
Lambda en VPC le hace recrear los ENIs). Claves vacías **no** borran la existente; `PORT` se saltea.

## 9. Variables de entorno (solo nombres)

**Backend**: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`,
`HOTEL_TZ`, `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY`, `MP_WEBHOOK_SECRET`,
`MP_REDIRECT_URI`, `MP_NOTIFICATION_URL`, `MP_APP_URL`, `MP_SITE_URL`, `MP_API_URL`,
`MP_TEST_ACCESS_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `REGISTER_KEY`.

- Todo pasa por `config/env.ts` **excepto `HOTEL_TZ`**, que se lee directo de `process.env` en
  `lib/date.ts` y por eso no figura en `.env.example`.
- `MP_NOTIFICATION_URL` se manda como `config.online.callback_url` de cada orden: es la URL a la que
  MP notifica. En dev puede apuntar a un túnel (`ngrok http 3000`, nunca a 5173).
- `MP_TEST_ACCESS_TOKEN` es solo de dev: si está cargado, las órdenes se crean con ese token y no
  hace falta OAuth. En producción se ignora por completo.
- `MP_WEBHOOK_SECRET` es **obligatorio en producción**: sin él el webhook responde 500 y no confirma
  pagos. En dev el webhook **no valida la firma** en absoluto si falta.
- `MP_REDIRECT_URI` tiene que estar registrada carácter por carácter en la app de MP.
- `SMTP_*` alimenta `lib/mailer.ts` (alta de usuario con código por email). Sin `SMTP_HOST`, en dev
  el código se imprime en la consola del backend (`[users] Código de verificación …`); en producción
  `POST /api/users/send-code` responde 500 `MAIL_NOT_CONFIGURED`. Hay que agregar las claves a
  `backend/.env.production` para que el sync de `deploy.sh` las suba.
- `REGISTER_KEY` (vacía = registro abierto): cuando está seteada, `/users/send-code` y
  `/users/register` exigen `key` en el body (403 `REGISTER_KEY_REQUIRED`, comparación timing-safe
  en `users.routes.ts`). Se coordina con `VITE_ALLOW_REGISTER` del frontend: **cerrado** = key
  puesta + flag off (la UI no aparece y la API exige secreto); **abierto** = key vacía + flag on.
  La key no puede ir al frontend (`VITE_*` es público en el bundle).

**Frontend**: `VITE_URL_BACKEND` (en `src/api/client.ts`) y `VITE_ALLOW_REGISTER` (en
`pages/LoginPage.tsx`; `"true"` muestra el botón "Crear usuario" + offcanvas de registro, default
oculto). Ambas documentadas en `frontend/.env.example`.

**Seed** (`backend/prisma/seed.ts`): `admin/admin123` y `recepcion/recepcion123` (Hotel Principal),
`sol/admin123` (Hotel Sol). El seed de habitaciones/servicios está comentado a propósito.

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

## 11. Tests

`node:test` puro, sin framework, sin DB. 6 suites de test (TAP cuenta 17 con los anidados), 73 tests:

| Archivo | Cubre |
|---|---|
| `tests/money.test.ts` | `resolveAmount` (decimal/cents/desconocido), `clampAmount` |
| `tests/mp-order.test.ts` | `buildOrderPayload`, `outstandingBalance` |
| `tests/mp-return-to.test.ts` | `resolveReturnTo` / `buildReturnUrl`, allowlist del `returnTo` |
| `tests/mp-webhook-signature.test.ts` | `buildManifestDataId`, `readSignatureTs`, `toEpochMs`, tolerancia |
| `tests/users-code.test.ts` | `generateCode`, `hashCode`/`isCodeMatch`, `isEmail` |
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

Configurable por env: `BENCH_BASE` (default `http://localhost:3100`), `BENCH_RAMP`, `BENCH_DURATION`,
`BENCH_ROOMS`, `BENCH_RESERVATIONS`, `BENCH_P97_LIMIT`, `BENCH_SEED=0`.

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
  components` es warn. Hoy pasa con 6 warnings y 0 errores; no los subas.
- Logout y demás acciones destructivas siempre con confirmación (`ConfirmDialog`).
- Ajustes de dinero: los cálculos viven en `lib/money.ts` (backend) y `lib/format.ts` (frontend);
  nunca reimplementar redondeo a mano.
- Mensajes de error, `code` de error y UI en español.
