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

Referencias oficiales: [compra de prueba de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/integration-test/payment-approval), [credenciales de suscripciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/credentials) y [recurso de usuarios y tag `test_user`](https://developers.mercadolibre.com.ar/es_ar/usuarios-y-aplicaciones). La documentación de credenciales indica que el token de prueba puede comenzar con `APP_USR`; no garantiza que el pago devuelva `live_mode=false`. El ejemplo de tags corresponde al recurso de usuarios de Mercado Libre: su disponibilidad en los endpoints de Mercado Pago debe validarse en testing, sin asumir que la ausencia de tags permita continuar.

Si la suscripción está autorizada y sus condiciones coinciden, devuelve `REVIEW/INSTALLMENT_REQUIRED`, el ID interno del contrato y el ID de suscripción persistido. Todavía falta verificar la cuota autorizada y sus fechas antes de registrar un período. La consulta no demuestra por sí sola la relación entre cuota, pago y suscripción. Si falta la referencia o las respuestas no coinciden, se detiene para revisión, sin completar datos mediante supuestos.

## Servicio desplegado

Después de desplegar una compilación que incluya estos scripts, ejecutarlos por SSH dentro del servicio de testing:

```bash
node dist/scripts/billingInspectCheckout.js <ownerId>
node dist/scripts/billingInspectPayment.js <paymentId>
```

`railway shell` y `railway run` ejecutan comandos locales con variables de Railway; no equivalen a entrar al contenedor con `railway ssh`. No compartir las variables ni ejecutar estos diagnósticos con credenciales reales de cobro. El retorno del checkout y una simulación de webhook exitosa no activan una suscripción.
