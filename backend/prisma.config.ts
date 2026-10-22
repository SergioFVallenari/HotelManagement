import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma Migrate abre una unica conexion y no soporta el pooler en modo
    // transaccion (6543), asi que la CLI va por el session pooler (DIRECT_URL).
    // El runtime sigue usando DATABASE_URL (6543 + pgbouncer) via el adapter.
    // El fallback a DATABASE_URL es para dev/local, donde no hay pooler.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});