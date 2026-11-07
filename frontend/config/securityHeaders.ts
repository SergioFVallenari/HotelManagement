import { readFileSync } from 'node:fs';

interface ResponseHeadersPolicy {
  CustomHeadersConfig: { Items: { Header: string; Value: string }[] };
}

const policy = JSON.parse(readFileSync(new URL('../cloudfront-response-headers.json', import.meta.url), 'utf8')) as ResponseHeadersPolicy;
const productionCsp = policy.CustomHeadersConfig.Items.find((header) => header.Header === 'Content-Security-Policy-Report-Only')?.Value ?? '';

if (!productionCsp) throw new Error('Falta la política CSP del frontend');

export function frontendSecurityHeaders(development: boolean, backendUrl?: string): Record<string, string> {
  const directives = new Map(productionCsp.split(';').map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources] as const;
  }));

  if (backendUrl) {
    const backend = new URL(backendUrl);
    if (!['http:', 'https:'].includes(backend.protocol)) {
      throw new Error('VITE_URL_BACKEND debe usar HTTP o HTTPS');
    }
    const connections = directives.get('connect-src')!;
    if (!connections.includes(backend.origin)) connections.push(backend.origin);
  }

  if (development) {
    // Vite inyecta el preámbulo de React Refresh y usa WebSocket para HMR.
    directives.get('script-src')!.push("'unsafe-inline'");
    directives.get('connect-src')!.push('ws://localhost:*', 'ws://127.0.0.1:*', 'wss://localhost:*', 'wss://127.0.0.1:*');
  }

  return {
    'Content-Security-Policy': [...directives].map(([name, sources]) => [name, ...sources].join(' ')).join('; '),
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  };
}
