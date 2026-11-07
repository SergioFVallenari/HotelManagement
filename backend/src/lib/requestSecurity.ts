const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_WRITES = new Set([
  '/api/mp/webhook',
  '/api/integrations/instagram/webhook',
]);

export function requiresCsrfHeader(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  if (PUBLIC_WRITES.has(normalized)) return false;
  if (/^\/api\/public\/booking\/[^/]+(?:\/receipt)?$/.test(normalized)) return false;
  return true;
}

export function isTrustedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (origin === undefined) return true;
  if (origin === 'null') return false;
  return allowedOrigins.includes(origin);
}
