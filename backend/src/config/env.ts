
import 'dotenv/config';

type AppEnv = 'development' | 'testing' | 'production';

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function parseAppEnv(): AppEnv {
  const value = process.env.APP_ENV ?? 'development';

  if (
    value !== 'development' &&
    value !== 'testing' &&
    value !== 'production'
  ) {
    throw new Error(`Invalid APP_ENV: ${value}`);
  }

  return value;
}

function parseOrigins(value: string | undefined, appEnv: AppEnv): string[] {
  if (value?.trim()) {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (appEnv === 'development') {
    return ['http://localhost:5173'];
  }

  throw new Error('Missing required env var: CORS_ORIGINS');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const appEnv = parseAppEnv();

const isDevelopment = appEnv === 'development';
const isTesting = appEnv === 'testing';
const isLiveEnvironment = appEnv === 'production';

const localFrontendUrl = 'http://localhost:5173';
const localBackendUrl = 'http://localhost:3000';

const frontendUrl = isDevelopment
  ? optional('FRONTEND_URL', localFrontendUrl)
  : required('FRONTEND_URL');

const backendUrl = isDevelopment
  ? optional('BACKEND_URL', localBackendUrl)
  : required('BACKEND_URL');

const instagramAppId = optional('INSTAGRAM_APP_ID');
const instagramAppSecret = optional('INSTAGRAM_APP_SECRET');
const instagramRedirectUri = optional('INSTAGRAM_REDIRECT_URI');

const instagramConfigured = Boolean(
  instagramAppId &&
  instagramAppSecret &&
  instagramRedirectUri
);

const mpAppId = optional('MP_APP_ID');
const mpClientSecret = optional('MP_CLIENT_SECRET');
const mpTokenEncryptionKey = optional('MP_TOKEN_ENCRYPTION_KEY');

const mercadoPagoConfigured = Boolean(
  mpAppId &&
  mpClientSecret &&
  mpTokenEncryptionKey
);

export const env = {
  // ==================================================
  // ENTORNO
  // ==================================================
  nodeEnv,
  appEnv,

  // Mantiene el significado original para compatibilidad.
  isProduction: nodeEnv === 'production',

  isDevelopment,
  isTesting,
  isLiveEnvironment,

  // ==================================================
  // SERVIDOR
  // ==================================================
  port: Number(process.env.PORT ?? 3000),

  frontendUrl,
  backendUrl,

  corsOrigins: parseOrigins(process.env.CORS_ORIGINS, appEnv),

  performanceDiagnostics:
    process.env.PERFORMANCE_DIAGNOSTICS === 'true',

  // ==================================================
  // DATABASE
  // ==================================================
  databaseUrl: required('DATABASE_URL'),

  directUrl: optional('DIRECT_URL'),

  // ==================================================
  // AUTENTICACIÓN
  // ==================================================
  jwtSecret: required('JWT_SECRET'),

  jwtExpiresIn: optional('JWT_EXPIRES_IN', '12h'),

  registerKey: optional('REGISTER_KEY'),

  // ==================================================
  // SUPABASE
  // ==================================================
  supabase: {
    url: required('SUPABASE_URL'),

    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

    anonKey: required('SUPABASE_ANON_KEY'),

    jwtSecret: optional('SUPABASE_JWT_SECRET'),
  },

  // ==================================================
  // MERCADOPAGO
  // ==================================================
  mp: {
    enabled: mercadoPagoConfigured,

    appId: mpAppId,

    clientSecret: mpClientSecret,

    appUrl: optional('MP_APP_URL', frontendUrl),

    siteUrl: optional(
      'MP_SITE_URL',
      'https://auth.mercadopago.com'
    ),

    apiUrl: optional(
      'MP_API_URL',
      'https://api.mercadopago.com'
    ),

    tokenEncryptionKey: mpTokenEncryptionKey,

    webhookSecret: optional('MP_WEBHOOK_SECRET'),

    redirectUri: optional(
      'MP_REDIRECT_URI',
      `${backendUrl}/api/mp/oauth/callback`
    ),

    notificationUrl: optional(
      'MP_NOTIFICATION_URL',
      `${backendUrl}/api/mp/webhook`
    ),

    testAccessToken: optional('MP_TEST_ACCESS_TOKEN'),
  },

  // ==================================================
  // INTELIGENCIA ARTIFICIAL
  // ==================================================
  ai: {
    enabled: Boolean(process.env.GEMINI_API_KEY),

    geminiApiKey: optional('GEMINI_API_KEY'),

    geminiModel: optional(
      'GEMINI_MODEL',
      'gemini-3.5-flash'
    ),

    geminiApiUrl: optional(
      'GEMINI_API_URL',
      'https://generativelanguage.googleapis.com/v1beta'
    ),
  },

  // ==================================================
  // INSTAGRAM
  // ==================================================
  ig: {
    enabled: instagramConfigured,

    appId: instagramAppId,

    appSecret: instagramAppSecret,

    redirectUri: instagramRedirectUri,

    authorizeUrl: optional(
      'INSTAGRAM_AUTHORIZE_URL',
      'https://www.instagram.com/oauth/authorize'
    ),

    tokenUrl: optional(
      'INSTAGRAM_TOKEN_URL',
      'https://api.instagram.com/oauth/access_token'
    ),

    graphHost: optional(
      'INSTAGRAM_GRAPH_HOST',
      'https://graph.instagram.com'
    ),

    graphApiUrl: optional(
      'INSTAGRAM_GRAPH_API_URL',
      'https://graph.instagram.com/v26.0'
    ),

    webhookVerifyToken: optional(
      'INSTAGRAM_WEBHOOK_VERIFY_TOKEN'
    ),

    frontendUrl: optional(
      'INSTAGRAM_FRONTEND_URL',
      frontendUrl
    ),
  },
};
