import { prisma } from '../src/config/prisma.js';
import { AppError } from '../src/lib/AppError.js';
import { adminCreateUser, signInWithPassword } from '../src/lib/supabaseAuth.js';
import { buildInternalMetadata } from '../src/modules/auth/auth.metadata.js';

interface SeedUser {
  username: string;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'RECEPCIONISTA';
}

async function ensureUser(companyId: number, user: SeedUser): Promise<void> {
  const existing = await prisma.userCompany.findUnique({
    where: { companyId_username: { companyId, username: user.username } },
  });
  if (existing) return;

  let authUserId: string;
  try {
    authUserId = await adminCreateUser({
      email: user.email,
      password: user.password,
      metadata: buildInternalMetadata({
        username: user.username,
        name: user.name,
        role: user.role,
        companyId,
        createdById: null,
        isActive: true,
      }),
    });
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'DUPLICATE') throw err;
    authUserId = (await signInWithPassword(user.email, user.password)).authUserId;
  }

  const type = await prisma.userType.upsert({
    where: { role: user.role },
    update: {},
    create: { role: user.role },
  });

  let appUser = await prisma.user.findUnique({ where: { authUserId } });
  if (!appUser) {
    appUser = await prisma.user.create({
      data: { email: user.email, name: user.name, authUserId },
    });
  }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: appUser.id, companyId } },
  });
  if (membership) return;

  await prisma.userCompany.create({
    data: {
      userId: appUser.id,
      companyId,
      username: user.username,
      typeId: type.id,
      isActive: true,
      createdById: null,
    },
  });
}

async function main(): Promise<void> {
  const principal = await prisma.company.upsert({
    where: { name: 'Hotel Principal' },
    update: {},
    create: { name: 'Hotel Principal' },
  });

  await ensureUser(principal.id, {
    username: 'admin',
    name: 'Administrador',
    email: 'admin@hotelprincipal.test',
    password: 'admin123',
    role: 'ADMIN',
  });
  await ensureUser(principal.id, {
    username: 'recepcion',
    name: 'Recepción',
    email: 'recepcion@hotelprincipal.test',
    password: 'recepcion123',
    role: 'RECEPCIONISTA',
  });
  console.log(`Empresa "${principal.name}" y sus usuarios listos (admin/admin123, recepcion/recepcion123)`);

  const sol = await prisma.company.upsert({
    where: { name: 'Hotel Sol' },
    update: {},
    create: { name: 'Hotel Sol' },
  });
  await ensureUser(sol.id, {
    username: 'sol',
    name: 'Administrador Hotel Sol',
    email: 'sol@hotelsol.test',
    password: 'admin123',
    role: 'ADMIN',
  });
  console.log(`Empresa "${sol.name}" lista (usuario sol/admin123)`);

  // const typeSeeds = [
  //   { name: 'Individual', rooms: [['101', 1, 40], ['102', 1, 45], ['103', 1, 45]] as const },
  //   { name: 'Doble', rooms: [['201', 2, 70], ['202', 2, 80], ['203', 2, 80]] as const },
  //   { name: 'Triple', rooms: [['301', 3, 95], ['302', 3, 100]] as const },
  //   { name: 'Suite', rooms: [['401', 4, 150], ['402', 4, 160]] as const },
  // ];

  // const amenitiesByType: Record<string, string[]> = {
  //   Individual: ['WiFi', 'TV', 'Aire acondicionado', 'Baño privado'],
  //   Doble: ['WiFi', 'TV', 'Aire acondicionado', 'Baño privado', 'Balcón'],
  //   Triple: ['WiFi', 'TV', 'Aire acondicionado', 'Baño privado', 'Escritorio'],
  //   Suite: ['WiFi', 'TV 4K', 'Aire acondicionado', 'Jacuzzi', 'Cocina equipada', 'Minibar'],
  // };

  // for (const t of typeSeeds) {
  //   const type = await prisma.roomType.upsert({
  //     where: { name: t.name },
  //     update: {},
  //     create: { name: t.name },
  //   });

  //   for (const [number, capacity, price] of t.rooms) {
  //     await prisma.room.upsert({
  //       where: { number },
  //       update: {},
  //       create: {
  //         number,
  //         name: `Habitación ${number}`,
  //         typeId: type.id,
  //         capacity,
  //         price,
  //         amenities: amenitiesByType[t.name],
  //       },
  //     });
  //   }
  //   console.log(`Tipo "${t.name}" y sus habitaciones listos`);
  // }

  // const serviceSeeds = [
  //   { name: 'Desayuno', price: 8, chargeType: 'PER_PERSON' },
  //   { name: 'Cena', price: 18, chargeType: 'PER_PERSON' },
  //   { name: 'Estacionamiento', price: 10, chargeType: 'PER_DAY' },
  //   { name: 'Lavandería (por kg)', price: 6, chargeType: 'PACK' },
  //   { name: 'Servicio a la habitación', price: 5, chargeType: 'PACK' },
  // ];
  // for (const s of serviceSeeds) {
  //   await prisma.service.upsert({
  //     where: { name: s.name },
  //     update: {},
  //     create: s,
  //   });
  // }
  // console.log('Servicios listos');

  // const guestCount = await prisma.guest.count();
  // if (guestCount === 0) {
  //   await prisma.guest.create({
  //     data: {
  //       firstName: 'María',
  //       lastName: 'González',
  //       phone: '+5491112345678',
  //       email: 'maria.gonzalez@example.com',
  //     },
  //   });
  //   console.log('Huésped de ejemplo creado');
  // }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
