import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.info('🌱 Seeding database...');

  const SALT_ROUNDS = 12;

  // ── Superadmin ──────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@1234', SALT_ROUNDS);
  const superAdmin = await prisma.adminUser.upsert({
    where: { email: 'admin@corpers-connect.ng' },
    update: {},
    create: {
      email: 'admin@corpers-connect.ng',
      passwordHash: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPERADMIN',
    },
  });
  console.info(`✅ Superadmin created: ${superAdmin.email}`);

  // ── Dev Corpers (matches NYSC mock data) ────────────────────────────────────
  const corper1Password = await bcrypt.hash('Corper@1234', SALT_ROUNDS);
  const corper1 = await prisma.user.upsert({
    where: { stateCode: 'KG/25C/1358' },
    update: {},
    create: {
      stateCode: 'KG/25C/1358',
      firstName: 'Iniubong',
      lastName: 'Udofot',
      email: 'udofotsx@yahoo.com',
      phone: '08024983733',
      passwordHash: corper1Password,
      servingState: 'Kogi State',
      lga: 'Lokoja',
      ppa: 'Mega Tech Solutions Lokoja',
      batch: '2025C',
      isOnboarded: false,
      isFirstLogin: true,
    },
  });
  console.info(`✅ Dev corper 1: ${corper1.stateCode} — ${corper1.firstName} ${corper1.lastName}`);

  const corper2Password = await bcrypt.hash('Corper@1234', SALT_ROUNDS);
  const corper2 = await prisma.user.upsert({
    where: { stateCode: 'KG/25C/1359' },
    update: {},
    create: {
      stateCode: 'KG/25C/1359',
      firstName: 'Pascal',
      lastName: 'Chukwuemerie',
      email: 'chukwuemeriepascal@outlook.com',
      phone: '08155408702',
      passwordHash: corper2Password,
      servingState: 'Kogi State',
      lga: 'Lokoja',
      ppa: 'Mcbayan Multibix Services Limited',
      batch: '2025C',
      isOnboarded: false,
      isFirstLogin: true,
    },
  });
  console.info(`✅ Dev corper 2: ${corper2.stateCode} — ${corper2.firstName} ${corper2.lastName}`);

  // Test corper with Gmail address (matches Resend account for OTP testing)
  const corper3Password = await bcrypt.hash('Corper@1234', SALT_ROUNDS);
  const corper3 = await prisma.user.upsert({
    where: { stateCode: 'KG/25C/1360' },
    update: {},
    create: {
      stateCode: 'KG/25C/1360',
      firstName: 'Iniubong',
      lastName: 'Udofot',
      email: 'iniubongudofot2000@gmail.com',
      phone: '08024983733',
      passwordHash: corper3Password,
      servingState: 'Kogi State',
      lga: 'Lokoja',
      ppa: 'Mega Tech Solutions Lokoja',
      batch: '2025C',
      isOnboarded: false,
      isFirstLogin: true,
    },
  });
  console.info(`✅ Dev corper 3: ${corper3.stateCode} — ${corper3.firstName} ${corper3.lastName}`);

  console.info('\n🎉 Database seeded successfully!');
  console.info('─────────────────────────────────────────');
  console.info('Admin login:  admin@corpers-connect.ng / Admin@1234');
  console.info('Corper 1:     KG/25C/1358 / Corper@1234  (udofotsx@yahoo.com)');
  console.info('Corper 2:     KG/25C/1359 / Corper@1234  (chukwuemeriepascal@outlook.com)');
  console.info('Corper 3:     KG/25C/1360 / Corper@1234  (iniubongudofot2000@gmail.com) ← use for OTP testing');
  console.info('─────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
