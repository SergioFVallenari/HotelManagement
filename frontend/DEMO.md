# Demo del CRM

Dashboard, Calendario, creación y consulta de reservas, pagos simulados, check-in/check-out y
cancelación. Incluye el recorrido de **reserva por link de WhatsApp**, con vista del huésped,
comprobante ficticio y aprobación/rechazo desde recepción. Habitaciones, tipos, servicios y
huéspedes permiten altas y edición; habitaciones, tipos y servicios también se pueden eliminar
si no están en uso. Configuración permite personalizar la apariencia, anticipos y contacto de la
página de reserva. Todo funciona en memoria, sin backend ni servicios externos.

## Desarrollo

Desde `frontend/`, con Node 22.18+ y las dependencias instaladas:

```bash
pnpm dev:demo
```

Abrir `http://localhost:5174`. No requiere backend, base de datos ni credenciales.
El acceso es directo como propietario de **Hotel Aurora · Demo**.

## Compilar y presentar

```bash
pnpm test:demo
pnpm build:demo
pnpm preview:demo
```

Abrir `http://localhost:4174`. La salida independiente está en `dist-demo/`.
Para compartirla, publicar únicamente esa carpeta en un hosting separado con fallback SPA
a `index.html`. No usar `backend/deploy.sh`: ese script despliega producción.

`pnpm build` y `pnpm dev` siguen siendo la aplicación normal. La demo se activa exclusivamente
mediante el modo de compilación `demo`, no con parámetros de URL ni opciones del usuario.

## Recorrido sugerido

1. Mostrar los indicadores y gráficos del Dashboard y alternar entre modo claro y oscuro.
2. Abrir Calendario y consultar una reserva ficticia.
3. Ir a Reservas → Nueva reserva. Buscar una habitación libre, elegir o crear un huésped
   ficticio y cargar una reserva con o sin anticipo.
4. Abrir la reserva y registrar un pago simulado en efectivo, tarjeta o transferencia.
5. Consultar nuevamente Dashboard y Calendario para ver los cambios.
6. Usar **Reiniciar demo** para restaurar el escenario.

### Reserva por link de WhatsApp

1. Abrir **Reservas por WhatsApp → Nueva solicitud**, elegir fechas y una habitación disponible,
   agregar servicios y revisar el anticipo sugerido (20%, redondeado a $10.000).
2. Crear la solicitud. Se muestran el link local y un mensaje ilustrativo, **sin abrir WhatsApp**.
3. Pulsar **Ver como huésped**. El formulario se abre en la misma pestaña y muestra el tipo de
   habitación, sin revelar el número. Los importes quedan congelados al crear la solicitud.
4. Usar los datos ficticios precargados y pulsar **Usar comprobante ficticio**. No hace falta
   seleccionar un archivo ni transferir dinero. Enviar la reserva.
5. Pulsar **Ir a recepción / verificar pago**, abrir la nueva reserva con badge **Verificar pago**
   y consultar la imagen ficticia del comprobante.
6. **Aprobar**: pasa a Reservada y registra el anticipo como transferencia simulada; el ingreso
   aparece en Dashboard. También se puede **Rechazar** con un motivo: cancela y libera la habitación,
   sin registrar ingresos. Ambas acciones tienen confirmación en la interfaz.
7. Volver a las solicitudes para ver el estado Enviada. Un link se usa una sola vez; las solicitudes
   abiertas pueden anularse. La habitación se vuelve a validar al enviar el formulario.

**Importante:** el link solo sirve en la pestaña que creó la solicitud. No abrirlo en una pestaña
nueva ni recargar: el escenario es local y no se comparte ni persiste. No es un link para enviar
a un huésped real. Si se abre fuera del escenario, se muestra un error con acceso de vuelta a recepción.

### Catálogos editables

1. En **Tipos de habitación**, crear un tipo ficticio y cambiarle el nombre.
2. En **Habitaciones**, crear una habitación de ese tipo, configurar capacidad, amenities y precio
   por noche o por persona. Editar o desactivar una habitación y comprobar su disponibilidad.
3. En **Servicios**, crear o editar un servicio y su modalidad de cobro; seleccionarlo en una reserva
   o solicitud nueva. Los cambios de precios no reescriben ofertas ya creadas.
4. En **Huéspedes**, crear o editar una ficha ficticia y consultar sus reservas.
5. Eliminar registros de catálogo recién creados y sin uso. Si tienen relaciones, la demo rechaza
   el borrado; las habitaciones y servicios pueden desactivarse desde su edición.
6. Reiniciar la demo para restaurar todos los catálogos y reservas.

### Configuración de la página de reserva

1. Abrir **Configuración → Apariencia → Personalizar estilo**. Los colores iniciales son los del
   CRM: violeta, acento turquesa, texto claro y fondo oscuro.
2. Cambiar los colores con el selector o el código hexadecimal y revisar la vista previa.
   Pulsar **Guardar estilo** para aplicarlos; **Restaurar colores predeterminados** recupera la
   paleta del CRM en el editor y luego se confirma con Guardar estilo.
3. Ir a **Reservas por WhatsApp**, crear una solicitud y usar **Ver como huésped** para ver la
   página con los colores guardados. Los links ya creados también usan la apariencia actual.
4. En **Configuración → Anticipos**, cambiar el porcentaje y guardar. Las solicitudes nuevas usan
   ese porcentaje; las anteriores conservan su anticipo. Con 0% no se pide comprobante.
5. En **Contacto**, guardar datos ficticios: se muestran como texto ilustrativo en el formulario,
   sin botones de llamada ni enlaces a WhatsApp.
6. **General** permite guardar el identificador y el límite de personas (validado contra la
   capacidad de habitaciones activas), pero la demo no publica ni habilita un portal de disponibilidad.

Todo se conserva únicamente en la pestaña actual y se restaura al reiniciar o recargar.

## Aislamiento y límites

- El cliente de API resuelve todas las peticiones localmente; las rutas no implementadas fallan
  de forma cerrada y nunca se reenvían al backend.
- No hay cobros, emails, envíos a WhatsApp, subidas de archivos, Instagram, IA ni conexiones a
  Supabase. El comprobante es una imagen ficticia generada localmente, sin seleccionar archivos reales.
  Mensajería, usuarios, pagos online, redes sociales, IA, consulta pública de estado y disponibilidad
  pública quedan fuera. Configuración incluye solo los ajustes de reservas, sin montar integraciones.
  La única página pública habilitada es la vista simulada del link de reserva.
- Los fixtures usan fechas relativas al día actual, correos `.example` y teléfonos ficticios.
- Las modificaciones viven solo en memoria y se pierden al recargar; cada pestaña es independiente.
- Es una simulación para presentar el producto, no una alternativa para operar un hotel.
- No cargar datos personales reales. No hace falta configurar variables `VITE_*` para la demo;
  como en cualquier build Vite, nunca colocar secretos en variables `VITE_*`.
