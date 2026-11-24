# Despliegue de testing: migrar antes de Railway

`.github/workflows/deploy-testing.yml` valida el backend sin credenciales remotas y, si la configuración está habilitada, aplica migraciones al Supabase de testing antes de desplegar el mismo commit en Railway. El workflow de producción no cambia. El CI de pull requests valida ahora tanto `develop` como `main`, sin migraciones remotas.

## Configuración previa, antes de fusionar cambios con migraciones

1. En Railway, abrir el proyecto y servicio que sirve `hotelmanagement-develop.up.railway.app`. Desactivar o desconectar su autodespliegue desde GitHub. No eliminar el servicio ni el despliegue activo. No basta con confiar en el orden de llegada de los eventos de GitHub: Railway no debe desplegar independientemente del workflow.
2. Confirmar que no quedan builds o despliegues automáticos pendientes que puedan arrancar antes de las migraciones.
3. Conservar las variables de aplicación existentes y verificar que `DATABASE_URL` y `DIRECT_URL` del servicio corresponden al proyecto de testing `sowbuvdeampxsbpgtgvo`. La validación del workflow comprueba su conexión de migraciones, no puede certificar las variables del contenedor.
4. Configurar el servicio para el repositorio completo, con Root Directory `/backend`, Dockerfile `Dockerfile.railway` (variable `RAILWAY_DOCKERFILE_PATH` relativa a esa raíz), puerto 3000 y healthcheck `/health`. El workflow sube un archivo limpio del repositorio completo; no usar como raíz de servicio `/` si el Dockerfile espera el contexto `backend`. No elegir el Dockerfile de Lambda.
5. Crear un Project Token de Railway para el proyecto y entorno de testing, no un token general de cuenta. Guardarlo en GitHub como `TESTING_RAILWAY_TOKEN`.
6. En GitHub → Settings → Environments, usar el entorno existente `laixia-deploy-testing / develop` (incluidos los espacios y la barra). Configurar los secrets descritos abajo y, si se desea aprobación antes de migrar, required reviewers. La política de ramas de este entorno debe permitir únicamente `develop`.
7. Configurar las variables de repositorio con los identificadores indicados. Revisar todo antes de habilitar los dos flags de repositorio; no activarlos como sustituto de desactivar realmente los autodespliegues.

## Secrets del entorno GitHub `laixia-deploy-testing / develop`

| Nombre | Valor |
|---|---|
| `TESTING_DIRECT_URL` | Session pooler Supabase del proyecto `sowbuvdeampxsbpgtgvo`, usuario `postgres.sowbuvdeampxsbpgtgvo`, puerto explícito 5432, base `postgres`, contraseña y `sslmode=require` o `verify-full`. No usar el puerto 6543. |
| `TESTING_RAILWAY_TOKEN` | Project Token limitado al entorno de testing de Railway. |

No reutilizar el secret `DIRECT_URL` de producción. No compartir valores en chat, capturas, logs o archivos. La validación rechaza parámetros de conexión no admitidos, otros proyectos y destinos de Railway distintos. El paso de migración recibe solo `DIRECT_URL`; el paso de Railway recibe solo su token. Ninguno recibe credenciales de billing, Auth ni AWS. La instalación de herramientas ocurre antes de exponer los secretos a sus pasos de uso.

## Variables del repositorio GitHub

Settings → Secrets and variables → Actions → Variables. Deben ser variables de repositorio, no del entorno, porque las condiciones de los jobs se evalúan antes de entrar al entorno protegido.

| Nombre | Valor |
|---|---|
| `TESTING_RAILWAY_PROJECT_ID` | `b08689c6-2f68-4a09-9b57-3460e7117464` |
| `TESTING_RAILWAY_ENVIRONMENT_ID` | `7a8a4ed7-5bfe-4bb4-8398-c808b1a7bd91` |
| `TESTING_RAILWAY_SERVICE_ID` | `f1b43b01-2a88-4661-9f61-bc564e8075bd` |
| `TESTING_RAILWAY_AUTODEPLOY_DISABLED` | `true` solo después de desactivar autodespliegues y vaciar ejecuciones pendientes en Railway. |
| `TESTING_DEPLOY_ENABLED` | `true` solo después de completar y revisar la configuración. |

Si faltan los flags, la validación local corre pero migración y despliegue se omiten. Es intencional para introducir el workflow sin modificar infraestructura. Si los flags están activos pero faltan secrets o IDs, el job falla antes de migrar. Cambios futuros de destinos requieren actualizar también las comprobaciones del código, no solo variables.

## Orden y primer despliegue

1. Revisar y fusionar el workflow en `develop` con el autodespliegue de Railway deshabilitado. El PR de reintentos ya fue fusionado y su backend está desplegado sin las columnas nuevas; no ejecutar reprocesamientos hasta aplicar y verificar la migración. No es necesario resetear la base ni volver a crear pagos. Para futuros cambios, introducir primero el circuito de migración y luego las funcionalidades que dependan de nuevas columnas.
2. Completar secrets, variables y configuración del servicio. Revisar el inventario de migraciones pendientes: `prisma migrate deploy` aplica todas, no solo la migración más reciente. Verificar respaldo y probar sobre una copia representativa según `MIGRACIONES.md` antes de autorizar migraciones.
3. Desde Actions ejecutar `Deploy LAIXIA Testing` con Run workflow y rama `develop` si hace falta probar la configuración antes del siguiente push.
4. Validación → herramientas → comprobación de destinos → comprobación de SHA actual de `develop` → `prisma migrate deploy` → nueva comprobación de SHA → `railway up` del archivo limpio de ese SHA → `/health`.
5. Tras validar el circuito, fusionar los cambios de billing con migraciones. El mismo flujo se ejecuta al subir a `develop`. No se llama `railway redeploy`: podría reconstruir código distinto al que se acaba de migrar. No usar deploy directo desde GitHub ni ejecutar migraciones durante `docker build`.

El despliegue usa Railway CLI 5.75.0. La cola de testing no cancela una migración en curso para lanzar otra ejecución. Si `develop` avanzó mientras se validaba o migraba, el workflow antiguo se detiene antes de desplegar; una ejecución posterior aplicará las migraciones restantes y desplegará su propio commit. Se suben exclusivamente archivos versionados con `git archive`, no `.env` de pruebas, dependencias instaladas ni artefactos locales.

## Fallos y límites

Un fallo de tests, configuración o migración impide iniciar el nuevo deploy. No se resuelven migraciones fallidas automáticamente ni se resetea la base. Si la migración fue exitosa pero falla Railway, el despliegue anterior puede seguir activo: las migraciones deben ser aditivas y compatibles con él. No revertir migraciones que ya contienen datos; corregir y volver a ejecutar desde el commit vigente. No cancelar manualmente un job que está migrando sin revisar el estado en la base.

El healthcheck HTTP comprueba disponibilidad, no certifica el SHA que responde ni reemplaza la revisión del estado del deployment en Railway. El primer flujo completo, la migración y la conexión del CLI con el servicio deben validarse en el entorno remoto: las pruebas locales usan URLs y tokens ficticios y no verifican la infraestructura. Este workflow despliega únicamente el backend; Cloudflare Pages y producción mantienen sus circuitos existentes.
