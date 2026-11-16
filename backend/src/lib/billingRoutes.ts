export function requiresBillingWriteCheck(method: string, path: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
  if (/^\/(auth|billing|public)(\/|$)/.test(path)) return false;
  if (path === '/mobile/auth/login' || path === '/mobile/auth/login/company') return false;
  return path !== '/mp/webhook' && path !== '/integrations/instagram/webhook';
}
