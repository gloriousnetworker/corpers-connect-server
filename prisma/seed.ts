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
    update: { isOnboarded: true, isFirstLogin: false },
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
      isOnboarded: true,
      isFirstLogin: false,
    },
  });
  console.info(`✅ Dev corper 1: ${corper1.stateCode} — ${corper1.firstName} ${corper1.lastName}`);

  const corper2Password = await bcrypt.hash('Corper@1234', SALT_ROUNDS);
  const corper2 = await prisma.user.upsert({
    where: { stateCode: 'KG/25C/1359' },
    update: { isOnboarded: true, isFirstLogin: false },
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
      isOnboarded: true,
      isFirstLogin: false,
    },
  });
  console.info(`✅ Dev corper 2: ${corper2.stateCode} — ${corper2.firstName} ${corper2.lastName}`);

  // ── Corpers Connect Official account ─────────────────────────────────────
  const officialPassword = await bcrypt.hash('Admin@1234', SALT_ROUNDS);
  const officialAccount = await prisma.user.upsert({
    where: { email: 'admin@corpersconnect.com.ng' },
    update: {
      isVerified: true,
      subscriptionTier: 'PREMIUM',
      level: 'CORPER',
      corperTag: true,
      corperTagLabel: 'Official',
      bio: 'The official Corpers Connect account. Follow us for updates, announcements, and community highlights.',
      isOnboarded: true,
      isFirstLogin: false,
    },
    create: {
      stateCode: 'CC/OFFICIAL/001',
      firstName: 'Corpers Connect',
      lastName: 'Official',
      email: 'admin@corpersconnect.com.ng',
      passwordHash: officialPassword,
      servingState: 'Kogi State',
      lga: 'Lokoja',
      ppa: 'Corpers Connect HQ',
      batch: '2025C',
      isVerified: true,
      subscriptionTier: 'PREMIUM',
      level: 'CORPER',
      corperTag: true,
      corperTagLabel: 'Official',
      bio: 'The official Corpers Connect account. Follow us for updates, announcements, and community highlights.',
      isOnboarded: true,
      isFirstLogin: false,
    },
  });
  console.info(`✅ Official account: ${officialAccount.email} — ${officialAccount.firstName} ${officialAccount.lastName}`);

  // ── Mutual follow between the two dev corpers ────────────────────────────
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: corper1.id, followingId: corper2.id } },
    create: { followerId: corper1.id, followingId: corper2.id },
    update: {},
  });
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: corper2.id, followingId: corper1.id } },
    create: { followerId: corper2.id, followingId: corper1.id },
    update: {},
  });
  console.info(`✅ Mutual follow: ${corper1.firstName} ↔ ${corper2.firstName}`);

  // ── Dev corpers auto-follow the official account ─────────────────────────
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: corper1.id, followingId: officialAccount.id } },
    create: { followerId: corper1.id, followingId: officialAccount.id },
    update: {},
  });
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: corper2.id, followingId: officialAccount.id } },
    create: { followerId: corper2.id, followingId: officialAccount.id },
    update: {},
  });
  console.info(`✅ Dev corpers follow Official account`);

  console.info('\n🎉 Database seeded successfully!');
  console.info('─────────────────────────────────────────');
  console.info('Admin panel:  admin@corpers-connect.ng / Admin@1234');
  console.info('Official:     admin@corpersconnect.com.ng / Admin@1234  (users app)');
  console.info('Corper 1:     KG/25C/1358 / Corper@1234  (udofotsx@yahoo.com)');
  console.info('Corper 2:     KG/25C/1359 / Corper@1234  (chukwuemeriepascal@outlook.com)');
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
