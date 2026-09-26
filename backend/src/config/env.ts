import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const LAMBDA_URL = 'https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws';
const CLOUDFRONT_URL = 'https://d5foovh2z74go.cloudfront.net';

function parseOrigins(value: string | undefined, nodeEnv: string): string[] {
  if (value?.trim()) return value.split(',').map((o) => o.trim()).filter(Boolean);
  return nodeEnv === 'production' ? [LAMBDA_URL] : ['http://localhost:5173'];
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS, nodeEnv),
  mp: {
    appId: process.env.MP_APP_ID ?? '',
    clientSecret: process.env.MP_CLIENT_SECRET ?? '',
    appUrl:
      process.env.MP_APP_URL ??
      (nodeEnv === 'production' ? CLOUDFRONT_URL : 'http://localhost:5173'),
    siteUrl: process.env.MP_SITE_URL ?? 'https://auth.mercadopago.com',
    apiUrl: process.env.MP_API_URL ?? 'https://api.mercadopago.com',
    tokenEncryptionKey: process.env.MP_TOKEN_ENCRYPTION_KEY ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    redirectUri:
      process.env.MP_REDIRECT_URI ??
      (nodeEnv === 'production'
        ? `${LAMBDA_URL}/api/mp/oauth/callback`
        : 'http://localhost:3000/api/mp/oauth/callback'),
    notificationUrl:
      process.env.MP_NOTIFICATION_URL ??
      (nodeEnv === 'production' ? `${LAMBDA_URL}/api/mp/webhook` : 'http://localhost:3000/api/mp/webhook'),
  },
};