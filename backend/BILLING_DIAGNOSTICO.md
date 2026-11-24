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

El comando no crea notificaciones falsas ni marca como procesados eventos de webhook anteriores. No modifica la cobertura, el estado del contrato, las flags ni la política de acceso. El webhook mantiene su verificación estricta de `live_mode=false`; la excepción de identidades declaradas solo entra por esta herramienta administrativa de testing. El registro manual no implementa renovaciones automáticas, cancelaciones, devoluciones ni conciliación general.

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

Alcance: recupera notificaciones ya almacenadas. No busca cobros que nunca notificó el proveedor, no procesa el tópico genérico `payment` y mantiene el rechazo de notificaciones firmadas con `live_mode=true` y de pagos LIVE en el procesador automático. El caso de pagos con cuentas de prueba declaradas continúa por conciliación manual, no se autoriza automáticamente por IDs aportados en HTTP. Este entregable por sí solo no completa las renovaciones automáticas del flujo de prueba validado ni habilita producción.

## Estado de contratos por `subscription_preapproval`

La migración aditiva `20261123140000_billing_subscription_state` agrega `OwnerBillingContract.providerUpdatedAt`, inicialmente nulo. El workflow de testing debe aplicarla antes de desplegar el backend que consulta esta columna. No se inicializa a la hora local del servidor: representa únicamente el `last_modified` verificado del proveedor.

El nuevo procesador consulta primero si el recurso pertenece a un contrato local de Mercado Pago. Si no hay contrato, no llama al proveedor ni marca el evento como procesado: lo deja `FAILED` con `BILLING_SUBSCRIPTION_REVIEW:CONTRACT_UNAVAILABLE`, espera e intentos acotados. Esto incluye simulaciones con recursos ficticios como `123456`: una respuesta 200 al simulador no demuestra una suscripción existente. No borrar ni marcar esos eventos como válidos para limpiar el contador.

Para contratos conocidos consulta GET `/preapproval/<id>` y `/users/me`. Exige coincidencia del ID, referencia `LAIXIA-CONTRACT-<id>`, mensualidad, importe, moneda y `collector_id` con el titular de la credencial. Exige `last_modified` válido con zona horaria y sin adelanto de más de cinco minutos respecto al reloj del servidor. No confía en el estado enviado por el webhook ni en el redirect. Referencia: [obtener una suscripción](https://www.mercadopago.com.ar/developers/es/reference/online-payments/subscriptions/get-preapproval/get).

Mapeo de estados: `pending` → `PENDING`, `authorized` → `AUTHORIZED`, `paused` → `PAUSED`, `cancelled` → `CANCELED`. Estados desconocidos, cambios de condiciones o datos incompletos quedan para revisión; no se rellenan con valores supuestos. No se requiere un email del pagador en la respuesta de preapproval porque no forma parte de la evidencia utilizada por este procesador.

La transacción bloquea el contrato y vuelve a validar sus condiciones y transición. Una versión anterior a `providerUpdatedAt` no pisa el estado nuevo; una versión idéntica con el mismo estado es idempotente, mientras que estados distintos para la misma versión requieren revisión. No se permite pasar de `CANCELED` a otro estado ni retroceder a `PENDING` desde un contrato autorizado o pausado. Una transición verificada actualiza contrato y evento de forma atómica; los errores usan el mismo lease y backoff que el procesador de cobros. Se conservan los eventos como rastro de procesamiento, sin almacenar respuestas completas ni datos de cuentas en los errores.

Autorizar un contrato no crea `OwnerBillingPayment` ni `OwnerBillingPeriod`, no activa acceso y no extiende fechas. Pausar o cancelar tampoco elimina pagos ni períodos ya registrados: el acceso por un período aprobado conserva la política existente hasta su vencimiento. No implementa cancelación desde la UI, devolución, contracargo ni regularización automática de cobros anteriores a una cancelación. La conciliación de pagos sobre contratos ya cancelados sigue requiriendo revisión y no debe forzarse cambiando estados.

Después de desplegar, `billingRetryEvents.js` incluye ambos tópicos en la vista previa y el lote, pero `selected` solo indica elegibilidad por fecha/intentos/lease, no que exista contrato ni que se haya validado el recurso. Un lote puede procesar contratos conocidos y dejar simulaciones en revisión. No ejecutar `--apply` hasta revisar la vista previa. Las pruebas locales cubren validación del proveedor y transiciones puras con respuestas simuladas; queda pendiente comprobar la transacción, eventos duplicados y concurrencia con fixtures propias en testing.
