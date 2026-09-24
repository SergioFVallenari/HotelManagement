import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

async function main(): Promise<void> {
  const adminType = await prisma.userType.upsert({
    where: { role: 'ADMIN' },
    update: {},
    create: { role: 'ADMIN' },
  });
  const recepcionType = await prisma.userType.upsert({
    where: { role: 'RECEPCIONISTA' },
    update: {},
    create: { role: 'RECEPCIONISTA' },
  });

  const adminPassword = bcrypt.hashSync('admin123', 10);
  const recepcionPassword = bcrypt.hashSync('recepcion123', 10);

  const principal = await prisma.company.upsert({
    where: { name: 'Hotel Principal' },
    update: {},
    create: { name: 'Hotel Principal' },
  });

  await prisma.user.upsert({
    where: { companyId_username: { companyId: principal.id, username: 'admin' } },
    update: { passwordHash: adminPassword, typeId: adminType.id, isActive: true },
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      name: 'Administrador',
      typeId: adminType.id,
      companyId: principal.id,
    },
  });
  await prisma.user.upsert({
    where: { companyId_username: { companyId: principal.id, username: 'recepcion' } },
    update: { passwordHash: recepcionPassword, typeId: recepcionType.id, isActive: true },
    create: {
      username: 'recepcion',
      passwordHash: recepcionPassword,
      name: 'Recepción',
      typeId: recepcionType.id,
      companyId: principal.id,
    },
  });
  console.log(`Empresa "${principal.name}" y sus usuarios listos (admin/admin123, recepcion/recepcion123)`);

  const sol = await prisma.company.upsert({
    where: { name: 'Hotel Sol' },
    update: {},
    create: { name: 'Hotel Sol' },
  });
  await prisma.user.upsert({
    where: { companyId_username: { companyId: sol.id, username: 'sol' } },
    update: { passwordHash: adminPassword, typeId: adminType.id, isActive: true },
    create: {
      username: 'sol',
      passwordHash: adminPassword,
      name: 'Administrador Hotel Sol',
      typeId: adminType.id,
      companyId: sol.id,
    },
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