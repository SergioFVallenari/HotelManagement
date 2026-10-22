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
  // Session pooler (Supabase 5432). Solo lo usa la CLI de Prisma via
  // prisma.config.ts, no el runtime, asi que no es obligatoria aca.
  directUrl: process.env.DIRECT_URL ?? '',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  // Supabase Auth (GoTrue) es el store de credenciales. Solo se usa la service
  // role key, server-side: la anon key nunca se distribuye, asi nadie puede
  // llamar a /auth/v1/signup por afuera del backend.
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: required('SUPABASE_ANON_KEY'),
    // Secreto HS256 del proyecto Supabase (Project Settings > API > JWT Settings).
    // Solo se usa para firmar el token de Realtime de la bandeja; si falta, la
    // bandeja cae al polling de respaldo y /api/realtime/config responde 503.
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  },
  port: Number(process.env.PORT ?? 3000),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS, nodeEnv),
  registerKey: process.env.REGISTER_KEY ?? '',
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
    testAccessToken: process.env.MP_TEST_ACCESS_TOKEN ?? '',
  },
  // Asistente de IA de la bandeja (Gemini). Sin API key el backend arranca
  // igual: /api/ai/config responde configured=false y los drafts devuelven 503.
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
    geminiApiUrl:
      process.env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
  },
  ig: {
    appId: required('INSTAGRAM_APP_ID'),
    appSecret: required('INSTAGRAM_APP_SECRET'),
    redirectUri: required('INSTAGRAM_REDIRECT_URI'),
    authorizeUrl: process.env.INSTAGRAM_AUTHORIZE_URL ?? 'https://www.instagram.com/oauth/authorize',
    tokenUrl: process.env.INSTAGRAM_TOKEN_URL ?? 'https://api.instagram.com/oauth/access_token',
    graphHost: process.env.INSTAGRAM_GRAPH_HOST ?? 'https://graph.instagram.com',
    graphApiUrl: process.env.INSTAGRAM_GRAPH_API_URL ?? 'https://graph.instagram.com/v26.0',
    webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? '',
    frontendUrl:
      process.env.INSTAGRAM_FRONTEND_URL ??
      (nodeEnv === 'production' ? CLOUDFRONT_URL : 'http://localhost:5173'),
  },
};
