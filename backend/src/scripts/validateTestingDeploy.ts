import { assertTestingDeployConfig } from '../lib/testingDeploy.js';

try {
  assertTestingDeployConfig({
    directUrl: process.env.DIRECT_URL ?? '',
    railwayToken: process.env.RAILWAY_TOKEN ?? '',
    railwayProjectId: process.env.RAILWAY_PROJECT_ID ?? '',
    railwayEnvironmentId: process.env.RAILWAY_ENVIRONMENT_ID ?? '',
    railwayServiceId: process.env.RAILWAY_SERVICE_ID ?? '',
  });
  console.log('Destinos de migración y despliegue de testing verificados.');
} catch {
  console.error('Configuración de testing inválida. Revisá secrets, session pooler con SSL e identificadores del servicio.');
  process.exitCode = 1;
}
