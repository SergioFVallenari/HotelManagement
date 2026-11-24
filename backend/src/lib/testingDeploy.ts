const TESTING_PROJECT = 'sowbuvdeampxsbpgtgvo';

export interface TestingDeployConfig {
  directUrl: string;
  railwayToken: string;
  railwayProjectId: string;
  railwayEnvironmentId: string;
  railwayServiceId: string;
}

export function assertTestingDeployConfig(config: TestingDeployConfig): void {
  let database: URL;
  try { database = new URL(config.directUrl); } catch { throw new Error('Falta una conexión válida de migraciones para testing.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.username !== `postgres.${TESTING_PROJECT}` ||
    !database.hostname.endsWith('.pooler.supabase.com') ||
    database.port !== '5432' || database.pathname !== '/postgres' ||
    !database.password || database.hash ||
    !['require', 'verify-full'].includes(database.searchParams.get('sslmode') ?? '')) {
    throw new Error('La conexión no corresponde al session pooler seguro del proyecto de testing.');
  }
  const allowedParameters = new Set(['sslmode', 'schema', 'connect_timeout', 'connection_limit', 'pool_timeout']);
  for (const [key] of database.searchParams) {
    if (!allowedParameters.has(key) || database.searchParams.getAll(key).length !== 1) {
      throw new Error('La conexión de testing contiene parámetros no admitidos.');
    }
  }
  if (database.searchParams.has('schema') && database.searchParams.get('schema') !== 'public') {
    throw new Error('Las migraciones de testing deben usar el esquema public.');
  }
  if (!config.railwayToken.trim()) throw new Error('Falta el token del proyecto de testing de Railway.');
  if (config.railwayProjectId !== 'b08689c6-2f68-4a09-9b57-3460e7117464' ||
    config.railwayEnvironmentId !== '7a8a4ed7-5bfe-4bb4-8398-c808b1a7bd91' ||
    config.railwayServiceId !== 'f1b43b01-2a88-4661-9f61-bc564e8075bd') {
    throw new Error('El destino de Railway no coincide con el servicio de testing verificado.');
  }
}
