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
      department: 'Trust & Safety',
    },
  });
  console.info(`✅ Superadmin created: ${superAdmin.email}`);

  // ── Admin Departments (seeded as created by superAdmin) ─────────────────────
  const departments = [
    'Trust & Safety',
    'Seller Relations',
    'Community Management',
    'Technical Support',
    'Finance & Subscriptions',
    'Content & Listings',
    'Partnerships & Opportunities',
  ];

  for (const name of departments) {
    await prisma.adminDepartment.upsert({
      where: { name },
      update: {},
      create: { name, createdById: superAdmin.id },
    });
  }
  console.info(`✅ ${departments.length} departments seeded`);

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

  // ── Mami Market Demo ──────────────────────────────────────────────────────
  //
  //  Pascal (corper2) is the SELLER.
  //  Iniubong (corper1) is the BUYER.
  //
  //  Flow:
  //    1. Pascal submits a seller application  → approved by super admin
  //    2. A SellerProfile is created for Pascal
  //    3. Pascal posts a NYSC khaki uniform listing
  //    4. Iniubong leaves a comment/bid on the listing
  //    5. Iniubong starts a marketplace conversation with Pascal
  //    6. They exchange messages negotiating and arranging meetup

  // 1. Seller Application (Pascal) — already approved
  const sellerApp = await prisma.sellerApplication.upsert({
    where: { userId: corper2.id },
    update: { status: 'APPROVED', reviewedAt: new Date('2026-04-01T10:00:00Z') },
    create: {
      userId: corper2.id,
      businessName: "Pascal's Corper Store",
      businessDescription:
        'I sell fairly used and brand-new NYSC-related items including uniforms, boots, and camp accessories to fellow corps members in Kogi State.',
      whatTheySell: 'NYSC uniforms, boots, camp gear, electronics',
      idDocUrl:
        'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-id-sample.jpg',
      status: 'APPROVED',
      reviewedAt: new Date('2026-04-01T10:00:00Z'),
      reviewNote: 'Valid NYSC ID submitted. Application approved.',
    },
  });
  console.info(`✅ Seller application: ${corper2.firstName} (${sellerApp.status})`);

  // 2. Seller Profile (Pascal)
  const sellerProfile = await prisma.sellerProfile.upsert({
    where: { userId: corper2.id },
    update: {},
    create: {
      userId: corper2.id,
      businessName: "Pascal's Corper Store",
      businessDescription:
        'I sell fairly used and brand-new NYSC-related items including uniforms, boots, and camp accessories to fellow corps members in Kogi State.',
      whatTheySell: 'NYSC uniforms, boots, camp gear, electronics',
      sellerStatus: 'ACTIVE',
    },
  });
  console.info(`✅ Seller profile: ${sellerProfile.businessName}`);

  // 3. Marketplace Listing — NYSC Khaki Uniform (Pascal selling)
  //    Use upsert on title+sellerId would require a unique index, so we use
  //    findFirst + createIfNotExists pattern to keep the seed idempotent.
  let listing = await prisma.marketplaceListing.findFirst({
    where: { sellerId: corper2.id, title: 'NYSC Khaki Uniform — Size M (Gently Used)' },
  });
  if (!listing) {
    listing = await prisma.marketplaceListing.create({
      data: {
        sellerId: corper2.id,
        title: 'NYSC Khaki Uniform — Size M (Gently Used)',
        description:
          "Selling my NYSC khaki uniform, size Medium. Only worn twice during CDS activities — still very clean and in excellent condition. Comes with the full set: trousers, shirt, and beret. Perfect for corps members who missed the camp issue or need a spare.\n\nPickup in Lokoja (NYSC Secretariat area preferred). Serious buyers only.",
        category: 'UNIFORM',
        price: 4500,
        listingType: 'FOR_SALE',
        images: [
          'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-uniform-1.jpg',
          'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-uniform-2.jpg',
        ],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        status: 'ACTIVE',
        viewCount: 14,
      },
    });
    console.info(`✅ Listing created: "${listing.title}" — ₦${listing.price}`);
  } else {
    console.info(`✅ Listing already exists: "${listing.title}"`);
  }

  // 4. Listing Comment/Bid (Iniubong bids on the listing)
  const existingComment = await prisma.listingComment.findFirst({
    where: { listingId: listing.id, authorId: corper1.id },
  });
  if (!existingComment) {
    await prisma.listingComment.create({
      data: {
        listingId: listing.id,
        authorId: corper1.id,
        content:
          "Hi! I'm interested in this. I can offer ₦3,500 — is that negotiable? I'm in Lokoja too so pickup should be easy.",
        bidAmount: 3500,
      },
    });
    // Notify Pascal about the comment
    await prisma.notification.create({
      data: {
        recipientId: corper2.id,
        actorId: corper1.id,
        type: 'LISTING_COMMENT',
        entityType: 'LISTING',
        entityId: listing.id,
        content: `${corper1.firstName} ${corper1.lastName} commented on your listing: "${listing.title}"`,
      },
    });
    console.info(`✅ Listing comment/bid from ${corper1.firstName}`);
  }

  // 5 & 6. Marketplace Conversation + Messages
  //    Check if conversation already exists (idempotent on listingId + buyerId)
  const existingMktConv = await prisma.marketplaceConversation.findUnique({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: corper1.id } },
  });

  if (!existingMktConv) {
    // Create the base Conversation (type: MARKETPLACE)
    const conv = await prisma.conversation.create({
      data: {
        type: 'MARKETPLACE',
        participants: {
          create: [
            { userId: corper1.id }, // Iniubong (buyer)
            { userId: corper2.id }, // Pascal (seller)
          ],
        },
      },
    });

    // Link it to the listing via MarketplaceConversation
    await prisma.marketplaceConversation.create({
      data: {
        conversationId: conv.id,
        listingId: listing.id,
        buyerId: corper1.id,
        sellerId: corper2.id,
      },
    });

    // Seed the message exchange — timestamps spaced 2–5 minutes apart
    const baseTime = new Date('2026-04-11T14:30:00Z');
    const minutesLater = (mins: number) => new Date(baseTime.getTime() + mins * 60 * 1000);

    const messages = [
      {
        senderId: corper1.id, // Iniubong opens
        content: "Hi Pascal! I saw your khaki uniform listing on Mami Market. Is it still available?",
        createdAt: minutesLater(0),
      },
      {
        senderId: corper2.id, // Pascal replies
        content: "Yes it is! Still in great condition — worn only twice during CDS. Are you interested?",
        createdAt: minutesLater(3),
      },
      {
        senderId: corper1.id,
        content: "Nice! I left a bid of ₦3,500 in the comments. Is that price something you'd consider?",
        createdAt: minutesLater(5),
      },
      {
        senderId: corper2.id,
        content: "Hmm, ₦3,500 is a bit low for a full set in this condition. Best I can do is ₦4,000 — that's final 😊",
        createdAt: minutesLater(8),
      },
      {
        senderId: corper1.id,
        content: "Okay, deal! ₦4,000 works for me. Where can we meet? I'm around Lokoja.",
        createdAt: minutesLater(10),
      },
      {
        senderId: corper2.id,
        content: "Perfect! Let's meet at the NYSC Secretariat on Thursday by 2pm. Does that work for you?",
        createdAt: minutesLater(13),
      },
      {
        senderId: corper1.id,
        content: "Thursday 2pm works! I'll be there. Please bring the full set — trousers, shirt, and beret.",
        createdAt: minutesLater(15),
      },
      {
        senderId: corper2.id,
        content: "Will do! See you Thursday. Come with the cash ready 😄 It was nice meeting a fellow corper through Mami Market!",
        createdAt: minutesLater(17),
      },
    ];

    const lastReadTime = minutesLater(17); // both have read everything

    for (const msg of messages) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderId: msg.senderId,
          content: msg.content,
          type: 'TEXT',
          createdAt: msg.createdAt,
        },
      });
    }

    // Update conversation's updatedAt to the last message time
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { updatedAt: lastReadTime },
    });

    // Mark both participants as having read the conversation
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: conv.id },
      data: { lastReadAt: lastReadTime },
    });

    // Notify Pascal about the first message from Iniubong
    await prisma.notification.create({
      data: {
        recipientId: corper2.id,
        actorId: corper1.id,
        type: 'MARKETPLACE_MESSAGE',
        entityType: 'CONVERSATION',
        entityId: conv.id,
        content: `${corper1.firstName} ${corper1.lastName} sent you a message about: "${listing.title}"`,
        createdAt: minutesLater(0),
      },
    });

    console.info(`✅ Marketplace conversation seeded — ${messages.length} messages between ${corper1.firstName} ↔ ${corper2.firstName}`);
  } else {
    console.info(`✅ Marketplace conversation already exists`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.info('\n🎉 Database seeded successfully!');
  console.info('─────────────────────────────────────────');
  console.info('Admin panel:  admin@corpers-connect.ng / Admin@1234');
  console.info('Official:     admin@corpersconnect.com.ng / Admin@1234  (users app)');
  console.info('Corper 1:     KG/25C/1358 / Corper@1234  — Iniubong Udofot (BUYER)');
  console.info('Corper 2:     KG/25C/1359 / Corper@1234  — Pascal Chukwuemerie (SELLER)');
  console.info('─────────────────────────────────────────');
  console.info('Departments seeded:', departments.join(', '));
  console.info('─────────────────────────────────────────\n');
  console.info('Marketplace demo:');
  console.info('  Seller:   Pascal — "Pascal\'s Corper Store"');
  console.info('  Listing:  NYSC Khaki Uniform — Size M @ ₦4,500');
  console.info('  Bid:      Iniubong offered ₦3,500 in comments');
  console.info('  Chat:     8 messages, negotiated to ₦4,000, meetup arranged');
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
