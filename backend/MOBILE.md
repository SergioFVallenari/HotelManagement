# API mobile (React Native / Expo)

Solo para OWNER, ADMIN y RECEPCIONISTA. Usa las mismas cuentas y hoteles que la web.
Por ahora permite iniciar sesión y leer el calendario interno, no modificar reservas.
No requiere migraciones ni nuevas variables de entorno.

## Login en dos pasos

Todas las llamadas usan HTTPS en producción. Los dos POST requieren
`Content-Type: application/json` y `X-GH-CSRF: 1`. En React Native nativo no hace
falta enviar `Origin`; si se envía (por ejemplo en Expo Web), debe estar en `CORS_ORIGINS`.
Cada paso admite 5 intentos por IP cada 15 minutos, además del límite global de escrituras.

1. `POST /api/mobile/auth/login`

```json
{ "email": "recepcion@example.com", "password": "contraseña" }
```

Devuelve `{ companies: [{ id, name, role }], token }` (sin envelope `data`).
Mostrar el selector de hotel, o elegir el único hotel disponible. Ese `token` es
de Supabase y solo se usa en el paso siguiente; conservarlo en memoria, no en almacenamiento persistente.

2. `POST /api/mobile/auth/login/company`

```json
{ "companyId": 7, "token": "<token del paso 1>" }
```

Devuelve `{ data: { token, tokenType: "Bearer", expiresAt, user } }`.
`user` incluye `id`, `username`, `role`, `name`, `email`, `companyId` y `companyName`.
Se valida la membresía activa; un OWNER solo puede entrar a un hotel que posee.

Guardar únicamente el token final con `expo-secure-store`. No se emiten cookies.
El JWT es exclusivo de las rutas móviles: no sirve en las rutas web y una cookie
web o token de Supabase tampoco autentica el calendario móvil.

## Calendario

`GET /api/mobile/calendar?from=2026-11-01&to=2026-11-30`

Enviar `Authorization: Bearer <token final>`. No enviar cookies.
Devuelve exactamente el mismo `{ data: { from, to, days, rooms } }` que `/api/calendar`:
habitaciones con `id`, `number`, `name`, `capacity`, `maxExtraBeds`, `typeName` y `cells`.
El detalle de las celdas está documentado en el esquema `Calendar` de `/api/docs`.
Incluye reservas y nombres de huéspedes, también reservas grupales; no es un
listado completo de fichas de huéspedes ni un endpoint de detalle de reserva.

Fechas `YYYY-MM-DD`, rango inclusivo de hasta 62 días; sin fechas usa el mes actual
según la zona del hotel. La empresa sale exclusivamente del token, no de la query.

## Ejemplo Expo

```ts
import * as SecureStore from 'expo-secure-store';

const API = 'https://<tu-backend>/api/mobile';
const TOKEN_KEY = 'hotel_mobile_token';

async function post(path: string, body: unknown) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', 'X-GH-CSRF': '1' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'No se pudo iniciar sesión');
  return result;
}

export async function iniciarLogin(email: string, password: string) {
  return post('/auth/login', { email, password });
}

export async function elegirHotel(companyId: number, token: string) {
  const { data } = await post('/auth/login/company', { companyId, token });
  await SecureStore.setItemAsync(TOKEN_KEY, data.token);
  return data.user;
}

export async function cargarCalendario(from: string, to: string) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) throw new Error('Iniciá sesión');
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(`${API}/calendar?${query}`, {
    credentials: 'omit',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    throw new Error('La sesión venció. Volvé a iniciar sesión');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'No se pudo cargar el calendario');
  return result.data;
}
```

La expiración usa `JWT_EXPIRES_IN` del backend. No hay refresh token por ahora:
ante 401, borrar el token y volver al login. Para cerrar sesión, pedir confirmación
y borrar el token local. No hay revocación remota inmediata: un token emitido
sigue siendo válido hasta expirar, igual que la sesión JWT web.
Para cambiar de hotel, repetir el login y reemplazar el token; limpiar los datos
del calendario del hotel anterior.

En dispositivos físicos, `localhost` es el teléfono, no tu PC. Para desarrollo usar
la IP LAN del backend o un túnel HTTPS. `expo-secure-store` aplica a Android/iOS;
este ejemplo no implementa persistencia para Expo Web.
