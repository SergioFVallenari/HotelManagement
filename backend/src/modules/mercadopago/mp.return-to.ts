// MercadoPago deprecó las integraciones WebView: en Android exige Chrome Custom
// Tabs. Cuando el OAuth arranca desde la app, el callback no vuelve a la SPA
// sino a un esquema propio que el intent-filter de Android convierte en un
// deep link hacia MainActivity. El esquema va hardcodeado y no en .env porque
// .env.production esta gitignored y un clone nuevo lo perderia.
export const APP_OAUTH_SCHEME = 'gestionhotel';
export const APP_OAUTH_HOST = 'oauth';
export const APP_RETURN_TO = `${APP_OAUTH_SCHEME}://${APP_OAUTH_HOST}`;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// Solo se acepta un origen pelado: sin path, query, fragmento ni credenciales.
// buildReturnUrl le agrega /settings?mp=..., asi que si aqui aceptamos
// "https://origen/cualquiera" terminariamos redirigiendo a una ruta arbitraria.
function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeOrigin(value: string): string | null {
  return parseOrigin(value)?.origin ?? null;
}

export function isAllowedReturnTo(value: string, allowedOrigins: string[]): boolean {
  if (value === APP_RETURN_TO) return true;
  const url = parseOrigin(value);
  if (!url) return false;
  if (allowedOrigins.some((origin) => normalizeOrigin(origin) === url.origin)) return true;
  // El dev puede arrancar en cualquier puerto si el de siempre esta ocupado.
  return LOCAL_HOSTNAMES.has(url.hostname);
}

export function resolveReturnTo(value: string, allowedOrigins: string[]): string {
  if (isAllowedReturnTo(value, allowedOrigins)) return value;
  for (const origin of allowedOrigins) {
    const normalized = normalizeOrigin(origin);
    if (normalized) return normalized;
  }
  return APP_RETURN_TO;
}

export function buildReturnUrl(returnTo: string, query: string): string {
  return `${returnTo.replace(/\/+$/, '')}/settings?${query}`;
}
