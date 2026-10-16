import { prisma } from '../src/config/prisma.js';

async function main(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { createdById: { not: null } },
    select: { id: true, name: true, createdById: true },
  });
  if (companies.length === 0) {
    console.log('[backfill] No hay hoteles con dueño; nada que hacer.');
    return;
  }

  const ownerType = await prisma.userType.upsert({
    where: { role: 'OWNER' },
    update: {},
    create: { role: 'OWNER' },
  });

  let cloned = 0;
  for (const company of companies) {
    const existing = await prisma.user.findFirst({
      where: { companyId: company.id, type: { role: 'OWNER' } },
      select: { id: true },
    });
    if (existing) continue;

    const owner = await prisma.user.findUnique({ where: { id: company.createdById! } });
    if (!owner) {
      console.warn(`[backfill] Hotel "${company.name}" (id ${company.id}): no existe el user dueño ${company.createdById}`);
      continue;
    }

    try {
      await prisma.user.create({
        data: {
          username: owner.username,
          passwordHash: owner.passwordHash,
          name: owner.name,
          email: owner.email,
          typeId: ownerType.id,
          companyId: company.id,
          createdById: company.createdById!,
        },
      });
      cloned++;
      console.log(`[backfill] OWNER "${owner.username}" clonado en "${company.name}"`);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        console.warn(`[backfill] Hotel "${company.name}": ya hay un usuario "${owner.username}", se omite (P2002)`);
        continue;
      }
      throw err;
    }
  }

  console.log(`[backfill] Listo: ${cloned} OWNER clonado(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });