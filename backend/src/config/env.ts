import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const LAMBDA_URL = 'https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws';

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
};