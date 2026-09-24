import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';
import { getTenantId } from '../lib/tenant.js';

const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  ...(isRemoteHost(env.databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
});

function isRemoteHost(databaseUrl: string): boolean {
  const hostname = new URL(databaseUrl).hostname;
  return hostname !== 'localhost' && hostname !== '127.0.0.1';
}

const SCOPEABLE_MODELS = new Set(['User', 'RoomType', 'Room', 'Guest', 'Service', 'Reservation']);

type RawArgs = Record<string, any>;

function mergeWhere(where: unknown, companyId: number): unknown {
  return where ? { AND: [where, { companyId }] } : { companyId };
}

export const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const companyId = getTenantId();
        if (!companyId || !SCOPEABLE_MODELS.has(model)) return query(args);

        const scope = (args as RawArgs).where;
        switch (operation) {
          case 'findUnique':
          case 'findUniqueOrThrow':
          case 'update':
          case 'delete':
            (args as RawArgs).where = { ...scope, companyId };
            break;
          case 'findFirst':
          case 'findFirstOrThrow':
          case 'findMany':
          case 'count':
          case 'groupBy':
          case 'aggregate':
          case 'updateMany':
          case 'deleteMany':
            (args as RawArgs).where = mergeWhere(scope, companyId);
            break;
          case 'create': {
            const data = (args as RawArgs).data ?? {};
            if (data.companyId === undefined) (args as RawArgs).data = { ...data, companyId };
            break;
          }
          case 'upsert': {
            const create = (args as RawArgs).create as Record<string, unknown> | undefined;
            if (create && create.companyId === undefined) (args as RawArgs).create = { ...create, companyId };
            break;
          }
        }
        return query(args);
      },
    },
  },
});