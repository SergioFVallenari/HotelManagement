# Diagnóstico de suscripciones en testing

Los comandos de diagnóstico son de solo lectura. No crean contratos, pagos, eventos ni períodos; tampoco habilitan acceso. No sustituyen la conciliación de cobros ni la validación de cuotas autorizadas.

## Requisitos

- Proyecto Supabase de testing `sowbuvdeampxsbpgtgvo`, con `DATABASE_URL` del pooler.
- `APP_ENV=testing`, `BILLING_MP_TEST_ENABLED=true` y `BILLING_MP_TEST_ACCESS_TOKEN`.
- Verificar en Mercado Pago que la credencial y las cuentas sean de prueba. El nombre del entorno no garantiza que la credencial lo sea.
- No es necesario activar webhook, acceso pago, enforcement ni límites.

Los comandos rechazan otros entornos y proyectos antes de consultar la base o al proveedor. Los errores no imprimen credenciales ni respuestas completas.

## Checkout pendiente

Desde `backend/`:

```bash
pnpm billing:inspect-checkout <ownerId>
```

Consulta hasta diez páginas de suscripciones. Marca la búsqueda como incompleta ante truncamiento, cambios en el total, IDs repetidos o falta de avance. La paginación no proporciona una instantánea transaccional del proveedor.

Una coincidencia coherente devuelve `REVIEW/POSSIBLE_MATCH`. No recupera el contrato ni devuelve la URL de checkout, correos o identificadores externos. Una búsqueda vacía o incompleta no autoriza otro intento de contratación. Los formatos todavía deben verificarse con respuestas reales de prueba antes de automatizar recuperaciones.

## Pago aprobado

```bash
pnpm billing:inspect-payment <paymentId>
```

Consulta el pago por GET, exige estado aprobado y acreditado y una referencia exacta `LAIXIA-CONTRACT-<id>`. Busca ese contrato en testing, compara importe y moneda y consulta la suscripción cuyo identificador ya está persistido. No interpreta el ID de una URL de actividad como un `preapproval_id`.

Ante `REVIEW/MODE_MISMATCH`, el campo `mode` distingue `LIVE` (`live_mode=true`), `MISSING` (campo ausente) e `INVALID` (presente con un valor que no es booleano). No se imprime el valor recibido. `MISSING` e `INVALID` siempre bloquean antes de consultar contratos o suscripciones.

Solo para este diagnóstico de lectura en testing, un pago con `live_mode=true` puede continuar si las consultas GET a `/users/me` y `/users/<payerId>` verifican que el titular de la credencial coincide con `collector_id`, que el comprador coincide con `payer.id`, que son cuentas distintas y que ambos tienen el tag exacto `test_user`. Si los endpoints no entregan evidencia suficiente, devuelve `MODE_MISMATCH` con un código `accounts`, sin correos, IDs de usuarios ni respuestas completas. Nombres, emails, prefijos de credencial y la configuración del entorno no reemplazan esa evidencia. No se modifica el procesador de pagos, su comprobación de modo ni la aceptación de webhooks LIVE.

Si los tags no están disponibles, el operador puede consultar los dos User IDs en el panel de cuentas de prueba de la aplicación y declararlos para una única ejecución de diagnóstico:

```bash
pnpm billing:inspect-payment <paymentId> <sellerTestUserId> <buyerTestUserId>
node dist/scripts/billingInspectPayment.js <paymentId> <sellerTestUserId> <buyerTestUserId>
```

El comando exige los dos IDs, distintos y numéricos, los compara exactamente con `collector_id` y `payer.id` del pago y consulta `/users/me` para vincular la credencial al vendedor. No necesita consultar el perfil del comprador: su ID debe coincidir con el devuelto en el pago. La salida incluye `testIdentitySource: OPERATOR_DECLARATION` para dejar claro que la clasificación como cuenta de prueba proviene de la revisión manual del panel, no de una certificación automática del proveedor. Una coincidencia de IDs no demuestra por sí sola que no haya dinero real: verificar su procedencia en el panel es responsabilidad del operador. Los IDs no se guardan en configuración ni en la base. Esta opción está limitada al diagnóstico de lectura en el proyecto de testing, no se expone por HTTP ni altera el webhook o el procesador de pagos.

Referencias oficiales: [compra de prueba de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-test/payment-approval), [credenciales de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/credentials) y [recurso de usuarios y tag `test_user`](https://developers.mercadolibre.com.ar/es_ar/usuarios-y-aplicaciones). La documentación de credenciales indica que el token de prueba puede comenzar con `APP_USR`; no garantiza que el pago devuelva `live_mode=false`. El ejemplo de tags corresponde al recurso de usuarios de Mercado Libre: su disponibilidad en los endpoints de Mercado Pago debe validarse en testing, sin asumir que la ausencia de tags permita continuar.

Si la suscripción está autorizada y sus condiciones coinciden, devuelve `REVIEW/INSTALLMENT_REQUIRED`, el ID interno del contrato y el ID de suscripción persistido. Todavía falta verificar la cuota autorizada y sus fechas antes de registrar un período. La consulta no demuestra por sí sola la relación entre cuota, pago y suscripción. Si falta la referencia o las respuestas no coinciden, se detiene para revisión, sin completar datos mediante supuestos.

## Servicio desplegado

Después de desplegar una compilación que incluya estos scripts, ejecutarlos por SSH dentro del servicio de testing:

```bash
node dist/scripts/billingInspectCheckout.js <ownerId>
node dist/scripts/billingInspectPayment.js <paymentId>
```

`railway shell` y `railway run` ejecutan comandos locales con variables de Railway; no equivalen a entrar al contenedor con `railway ssh`. No compartir las variables ni ejecutar estos diagnósticos con credenciales reales de cobro. El retorno del checkout y una simulación de webhook exitosa no activan una suscripción.

## Conciliación manual controlada

Disponible únicamente en el proyecto de testing verificado, con billing experimental habilitado. No requiere activar el webhook. Los IDs de vendedor y comprador deben verificarse primero en el panel de cuentas de prueba. Esta declaración del operador no es una certificación automática de sandbox.

Por defecto solo simula:

```bash
pnpm billing:reconcile-payment <contractId> <installmentId> <paymentId> <sellerTestUserId> <buyerTestUserId>
node dist/scripts/billingReconcilePayment.js <contractId> <installmentId> <paymentId> <sellerTestUserId> <buyerTestUserId>
```

Consulta de nuevo la cuota autorizada y el pago individual mediante GET, comprueba estados, IDs, referencia, contrato, periodicidad mensual, importes, moneda y fechas. Contrasta las cuentas declaradas con el pago y `/users/me`. Una simulación coherente devuelve `VERIFIED_NOT_APPLIED` con las fechas de aprobación y débito recibidas, no con un período garantizado: la comprobación transaccional de conflictos sigue pendiente. No se modifican webhooks ni datos de facturación durante la simulación.

Después de revisar la simulación y autorizar expresamente la escritura, repetir el mismo comando con `--apply` al final. No reutiliza una evidencia cacheada: vuelve a consultar al proveedor y a verificar todo. La aplicación se rechaza si `BILLING_PAID_ACCESS_TESTING` está activo; no cambiar flags para forzar el comando.

`--apply` reutiliza la persistencia transaccional del procesador, bloquea contrato y cuenta, revalida condiciones y registra pago y período juntos. Los IDs únicos de pago y cuota, la comprobación de datos existentes y la serialización evitan duplicados; una repetición coherente devuelve `ALREADY_RECORDED` sin agregar otro período. Una cuota fuera de orden, un conflicto o un cambio de contrato revierte la transacción. Se conservan los cálculos de períodos existentes: comienzan como mínimo después del trial y del período previo, tomando la fecha mayor entre aprobación y débito programado.

El comando no crea notificaciones falsas ni marca como procesados eventos de webhook anteriores. No modifica la cobertura, el estado del contrato, las flags ni la política de acceso. El webhook mantiene por defecto su verificación estricta de `live_mode=false`; la declaración de IDs en este comando no habilita la excepción automática de cuentas configuradas descrita al final. El registro manual no implementa renovaciones automáticas, cancelaciones, devoluciones ni conciliación general.

Las pruebas unitarias de conciliación usan dependencias simuladas, no una base real. La prueba existente `tests/billing-payment-processor.manual.ts` sigue cubriendo concurrencia de la persistencia y requiere ejecución controlada adicional en testing después del refactor. No debe ejecutarse automáticamente ni confundirse con validación de pagos reales del proveedor.

## Recuperación de eventos recibidos

Aplicar primero la migración aditiva `20261123120000_billing_webhook_retries` en testing. Agrega `nextAttemptAt` y `lockedUntil`, conserva los eventos y excluye del reprocesamiento los ya procesados. Generar el cliente Prisma y compilar antes de desplegar; el backend actualizado depende de esas columnas. No aplicar automáticamente a producción.

El webhook y el reprocesador comparten una reclamación atómica del evento con lease de dos minutos. Se procesan eventos `subscription_authorized_payment` y `subscription_preapproval`, proveedor Mercado Pago, estados `RECEIVED`/`FAILED`, con fecha de intento vencida y sin otro lease vigente. Cada procesador reclama exclusivamente su tópico. El contador se incrementa al reclamar, no al completar. Un fallo libera el lease y programa esperas de 1, 2, 4, 8, 16, 32 y 60 minutos; tras ocho intentos queda para revisión. Si el proceso muere, el lease vence y permite recuperar el evento, salvo que haya agotado los intentos. Las escrituras del pago y período siguen protegidas por los bloqueos transaccionales y claves únicas, incluso si vence un lease durante una operación lenta.

Desde el servicio de testing, primero inspeccionar sin escribir:

```bash
node dist/scripts/billingRetryEvents.js
```

Devuelve cantidades seleccionadas (máximo 20), agotadas y de tópicos aún no soportados, sin recursos ni datos personales. No consulta al proveedor ni reclama eventos. Requiere el proyecto de testing verificado, `BILLING_MP_TEST_ENABLED`, `BILLING_MP_TEST_WEBHOOK_ENABLED` y la credencial configurada.

Solo con autorización para reprocesar:

```bash
node dist/scripts/billingRetryEvents.js --apply
```

Procesa hasta 20 eventos secuencialmente, reconsultando cuota y pago. Un fallo no cancela el resto del lote; las cantidades de salida resumen el resultado de esa ejecución. Un evento que ya fue reclamado, aún no vence o ya está procesado se difiere sin crear pagos. Se guardan códigos de error, nunca respuestas completas del proveedor. No se reinician intentos automáticamente ni se liberan bloqueos para forzar otro intento.

Este comando se puede configurar posteriormente como un proceso programado de Railway cada cinco minutos con las mismas variables de testing, ejecutando `node dist/scripts/billingRetryEvents.js --apply`; no se agrega ningún intervalo al servidor ni se configura el scheduler desde el repositorio. No habilitar la programación antes de aplicar y validar la migración y la concurrencia en testing. La prueba manual del procesador ahora verifica también reclamación única, contador y limpieza de lease.

Alcance: recupera notificaciones ya almacenadas. No busca cobros que nunca notificó el proveedor y no procesa el tópico genérico `payment`. Por defecto rechaza notificaciones firmadas con `live_mode=true` y pagos LIVE en el procesador automático. La excepción opcional de cuentas configuradas del backend se describe al final; nunca se autoriza por IDs aportados en HTTP. Este entregable por sí solo no completa las renovaciones automáticas ni habilita producción.

## Estado de contratos por `subscription_preapproval`

La migración aditiva `20261123140000_billing_subscription_state` agrega `OwnerBillingContract.providerUpdatedAt`, inicialmente nulo. El workflow de testing debe aplicarla antes de desplegar el backend que consulta esta columna. No se inicializa a la hora local del servidor: representa únicamente el `last_modified` verificado del proveedor.

El nuevo procesador consulta primero si el recurso pertenece a un contrato local de Mercado Pago. Si no hay contrato, no llama al proveedor ni marca el evento como procesado: lo deja `FAILED` con `BILLING_SUBSCRIPTION_REVIEW:CONTRACT_UNAVAILABLE`, espera e intentos acotados. Esto incluye simulaciones con recursos ficticios como `123456`: una respuesta 200 al simulador no demuestra una suscripción existente. No borrar ni marcar esos eventos como válidos para limpiar el contador.

Para contratos conocidos consulta GET `/preapproval/<id>` y `/users/me`. Exige coincidencia del ID, referencia `LAIXIA-CONTRACT-<id>`, mensualidad, importe, moneda y `collector_id` con el titular de la credencial. Exige `last_modified` válido con zona horaria y sin adelanto de más de cinco minutos respecto al reloj del servidor. No confía en el estado enviado por el webhook ni en el redirect. Referencia: [obtener una suscripción](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/get-preapproval/get).

Mapeo de estados: `pending` → `PENDING`, `authorized` → `AUTHORIZED`, `paused` → `PAUSED`, `cancelled` → `CANCELED`. Estados desconocidos, cambios de condiciones o datos incompletos quedan para revisión; no se rellenan con valores supuestos. No se requiere un email del pagador en la respuesta de preapproval porque no forma parte de la evidencia utilizada por este procesador.

La transacción bloquea el contrato y vuelve a validar sus condiciones y transición. Una versión anterior a `providerUpdatedAt` no pisa el estado nuevo; una versión idéntica con el mismo estado es idempotente, mientras que estados distintos para la misma versión requieren revisión. No se permite pasar de `CANCELED` a otro estado ni retroceder a `PENDING` desde un contrato autorizado o pausado. Una transición verificada actualiza contrato y evento de forma atómica; los errores usan el mismo lease y backoff que el procesador de cobros. Se conservan los eventos como rastro de procesamiento, sin almacenar respuestas completas ni datos de cuentas en los errores.

Autorizar un contrato no crea `OwnerBillingPayment` ni `OwnerBillingPeriod`, no activa acceso y no extiende fechas. Pausar o cancelar tampoco elimina pagos ni períodos ya registrados: el acceso por un período aprobado conserva la política existente hasta su vencimiento. No implementa cancelación desde la UI, devolución, contracargo ni regularización automática de cobros anteriores a una cancelación. La conciliación de pagos sobre contratos ya cancelados sigue requiriendo revisión y no debe forzarse cambiando estados.

Después de desplegar, `billingRetryEvents.js` incluye ambos tópicos en la vista previa y el lote, pero `selected` solo indica elegibilidad por fecha/intentos/lease, no que exista contrato ni que se haya validado el recurso. Un lote puede procesar contratos conocidos y dejar simulaciones en revisión. No ejecutar `--apply` hasta revisar la vista previa. Las pruebas locales cubren validación del proveedor y transiciones puras con respuestas simuladas; queda pendiente comprobar la transacción, eventos duplicados y concurrencia con fixtures propias en testing.

## Sincronizar un contrato existente sin fabricar eventos

Cuando no se recibió una notificación válida para el contrato existente, se puede consultar directamente su suscripción persistida:

```bash
pnpm billing:sync-subscription <contractId>
node dist/scripts/billingSyncSubscription.js <contractId>
```

Es una vista previa por defecto. Requiere `APP_ENV=testing`, el proyecto de base verificado, `BILLING_MP_TEST_ENABLED=true` y la credencial de billing configurada. No requiere activar el webhook ni desactivar el acceso al período pagado: esta herramienta solo sincroniza estado contractual, no acredita pagos ni cambia la política de acceso. No recibe un recurso externo arbitrario: resuelve la suscripción desde el ID interno del contrato solicitado.

La vista previa reconsulta GET `/preapproval/<id>` y `/users/me` con las mismas verificaciones del procesador de eventos. Devuelve `VERIFIED_NOT_APPLIED` junto con estados local y del proveedor, versión y transición prevista. Las condiciones y transiciones se revalidan otra vez bajo bloqueo al aplicar; la vista previa no garantiza que el contrato permanezca sin cambios mientras se revisa.

Solo después de revisar el resultado y autorizar la escritura, repetir con `--apply` al final. Vuelve a consultar los recursos y utiliza la persistencia transaccional compartida con el webhook. Devuelve `UPDATED`, `UNCHANGED` o `STALE`, con el estado y versión efectivos que conserva el contrato. Una repetición coherente no actualiza otra vez el contrato; versiones antiguas no lo hacen retroceder. No reinicia intentos, no crea eventos de webhook ficticios y no modifica ni marca como procesadas las simulaciones ya almacenadas.

No crea ni modifica pagos o períodos ni extiende acceso. El período aprobado ya registrado se conserva independientemente del estado contractual. No completa el circuito automático de cobros y no cancela o reactiva la suscripción en Mercado Pago. Usa la columna `providerUpdatedAt` de la migración anterior; no agrega migraciones nuevas. La extracción de la transacción es compartida con el procesador existente: las pruebas unitarias usan persistencia simulada y no sustituyen una validación controlada de concurrencia en PostgreSQL.

## Automatización opcional para cuentas de prueba configuradas

Apagada por defecto. Solo habilitable por el operador del backend en `APP_ENV=testing`, con billing de prueba activo y `DATABASE_URL` del proyecto verificado `sowbuvdeampxsbpgtgvo`. No admite otros proyectos ni permite elegir cuentas desde una solicitud HTTP. Antes de configurar IDs, comprobar en el panel de cuentas de prueba de Mercado Pago que vendedor y comprador sean realmente las cuentas de prueba previstas. Una coincidencia de IDs no certifica por sí sola que una operación sea sandbox; esa clasificación continúa siendo una declaración operativa.

Variables nuevas, exclusivamente en el backend de testing:

```text
BILLING_MP_TEST_ACCOUNTS_ENABLED=false
BILLING_MP_TEST_SELLER_ID=<User ID del vendedor de prueba verificado>
BILLING_MP_TEST_BUYER_ID=<User ID del comprador de prueba verificado>
```

Mantener la flag apagada hasta revisar las cuentas y autorizar la prueba controlada. En producción se ignoran estas variables. Si la flag está habilitada pero faltan IDs válidos, son iguales, billing está apagado o la base no corresponde a testing, el webhook y reprocesador fallan cerrados antes de reclamar eventos o registrar pagos.

Con esta opción activa, solo las notificaciones `subscription_authorized_payment` pueden admitir `live_mode=true`, y siempre necesitan firma válida, ventana temporal y recurso coherente. Las notificaciones genéricas `payment` y `subscription_preapproval` con `live_mode=true` siguen rechazadas. La aceptación del webhook no acredita un pago: solo permite guardar la notificación para verificarla.

El procesador vuelve a consultar cuota y pago y exige que `collector_id` sea el vendedor configurado, que `payer.id` sea el comprador configurado y que `/users/me` identifique al mismo vendedor. Hace esto también para pagos con `live_mode=false` cuando la política está activa. Luego conserva todos los controles existentes de contrato, referencia, cuota, estados, importe, moneda y fechas. Los modos ausentes o no booleanos siguen rechazados. Reutiliza los bloqueos de contrato/cuenta, la transacción y las claves únicas para registrar pago y período; un evento duplicado no debe duplicar el período.

No modifica el campo `live_mode` recibido ni rellena tags o estados. No consulta etiquetas del comprador que ya se comprobó que no están disponibles. En procesamiento exitoso registra un mensaje `[billing]` con evento, contrato y `testIdentitySource: OPERATOR_CONFIGURATION`, sin IDs de cuentas, emails, tokens ni respuestas completas. La política se revalida en cada intento: apagarla vuelve a la comprobación estricta incluso para eventos LIVE ya almacenados. No se usan los argumentos de los comandos manuales como configuración automática.

### Primera validación sin escrituras

La vista previa del reprocesador ahora incluye `configuredTestAccounts: true/false`, sin IDs. Para comprobar directamente una cuota individual con la misma política del procesador, sin crear eventos, pagos o períodos:

```bash
pnpm billing:preview-payment <authorizedPaymentId>
node dist/scripts/billingPreviewPayment.js <authorizedPaymentId>
```

No admite `--apply`. Consulta cuota, pago, contrato e identidad; devuelve `VERIFIED_NOT_APPLIED` o `REVIEW`. Indica `testIdentitySource: OPERATOR_CONFIGURATION` si usó las cuentas configuradas, o `STRICT_TEST_MODE` si la política está apagada. No exige apagar el período pagado ni activar el webhook para esta vista previa. Revisar el resultado antes de reenviar desde Mercado Pago una notificación del recurso existente; no generar otro cobro para probar recepción.

No configurar cron ni poner esta flag en producción. El cambio no implementa búsqueda de cobros nunca notificados, actualización de devoluciones/contracargos, cancelación desde la UI ni automatización general de suscripciones. Las pruebas locales simulan recursos y firma; queda pendiente probar recepción real, concurrencia e idempotencia transaccional en testing con la opción activa. No hay migraciones nuevas y la implementación no activa variables remotas.

## Recuperar una cuota no notificada con la política configurada

```bash
pnpm billing:recover-payment <contractId> <installmentId> <paymentId>
node dist/scripts/billingRecoverPayment.js <contractId> <installmentId> <paymentId>
```

Simula por defecto y requiere la política de cuentas configuradas activa, el proyecto de testing verificado y la credencial presente. No recibe cuentas por argumentos ni necesita cambiar `BILLING_PAID_ACCESS_TESTING`. Exige el contrato interno, cuota y pago esperados, periodicidad mensual y todas las comprobaciones de evidencia que utiliza el procesador automático. La simulación devuelve `VERIFIED_NOT_APPLIED`; no verifica aún conflictos transaccionales de persistencia ni garantiza el período final.

Solo tras revisar la evidencia y autorizar escrituras, repetir con `--apply`. Reconsulta cuota, pago e identidad de la credencial, no reutiliza la vista previa. Reutiliza `recordTestBillingPayment`: bloquea contrato y cuenta, revalida condiciones y guarda pago y período atómicamente. Devuelve `RECORDED` o `ALREADY_RECORDED` y las fechas efectivas. Un conflicto o cuota fuera de orden revierte la transacción; no liberar contratos ni cambiar estados para forzarlo.

Con el acceso pago experimental ya activo, registrar un período vigente puede cambiar inmediatamente el acceso efectivo de la cuenta recuperada. No cambia la flag global, cobertura ni estado contractual. No llama a endpoints de creación o modificación de Mercado Pago, no genera cobros ni eventos ficticios y no marca notificaciones anteriores como procesadas. No requiere apagar el webhook y puede coexistir con su procesamiento mediante los bloqueos y claves únicas existentes; esa concurrencia aún debe validarse de forma controlada en PostgreSQL.

Es una recuperación administrativa de una cuota identificada previamente, no búsqueda automática ni cron. No demuestra entrega del webhook y no sustituye la validación del próximo evento real. No modifica el comando anterior de conciliación con cuentas declaradas ni sus restricciones. No agrega migraciones ni ejecuta escrituras remotas durante la implementación; las pruebas locales usan dependencias simuladas.
