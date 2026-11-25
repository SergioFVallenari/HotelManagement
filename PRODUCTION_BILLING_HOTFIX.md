# Retirar suscripciones de la experiencia de producción

Hotfix sobre `main`, sin revertir el merge de funcionalidades ni modificar el schema o migraciones.

- El frontend requiere `VITE_BILLING_ENABLED=true` explícito para montar el banner, consultar billing desde él o mostrar el panel de suscripción. Sin la flag, `/settings?tab=suscripcion` vuelve al menú de ajustes.
- El build de producción de GitHub Actions fuerza `VITE_BILLING_ENABLED=false`. La flag es pública y solo controla UI; la API tiene su propia protección.
- Las rutas `/api/billing/*` responden 404 en `APP_ENV=production` antes de ejecutar handlers de lectura, cobertura, checkout o webhook. Otros módulos, incluidos pagos de huéspedes y reservas, no se cambian.
- La imagen de Lambda define `APP_ENV=production` por defecto. Verificar antes de desplegar que las variables de Lambda no sobrescriban ese valor con development/testing. Los controles experimentales ya existentes se ignoran en producción.

No se borran tablas, contratos, pagos, períodos, eventos ni membresías. Los triggers de provisioning de trial permanecen en la base como hasta ahora; no se presentan al usuario ni se revierten migraciones históricas. No desactiva posibles suscripciones externas en Mercado Pago ni altera flags de base de datos: revisar por separado si alguna se activó manualmente en producción.

La rama de testing no se modifica por este hotfix. Cuando se integre posteriormente hacia `develop`, configurar `VITE_BILLING_ENABLED=true` en el build de Cloudflare Pages de testing para conservar su experiencia; no usar `MODE=production` como sinónimo de entorno comercial, porque Vite también utiliza ese modo al compilar testing.

Antes de integrar nuevos cambios desde develop hacia main, conservar este control y evitar habilitar billing comercial accidentalmente. Fusionar el PR hacia main dispara el workflow de producción existente, que ejecuta `prisma migrate deploy`: este hotfix no agrega migraciones, pero hay que revisar que no haya migraciones históricas pendientes antes de autorizar el deploy. No resetear ni revertir la base.

Comprobaciones posteriores: no debe verse banner ni tarjeta Suscripción; el enlace profundo de suscripción debe mostrar ajustes generales; las rutas billing deben devolver 404; reservas, calendario, altas de usuarios y pagos de huéspedes deben seguir disponibles. No se ejecutaron despliegues ni cambios remotos durante la preparación del hotfix.
