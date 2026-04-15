import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ── Unsplash image helper ──────────────────────────────────────────────────────
function unsplash(photoId: string, w = 600): string {
  return `https://images.unsplash.com/photo-${photoId}?w=${w}&q=80&fit=crop`;
}

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

  // ── Admin Departments ────────────────────────────────────────────────────────
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

  // ── Dev Corpers ──────────────────────────────────────────────────────────────
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
  console.info(`✅ Corper 1: ${corper1.stateCode} — ${corper1.firstName} ${corper1.lastName}`);

  const corper2Password = await bcrypt.hash('Corper@1234', SALT_ROUNDS);
  const corper2 = await prisma.user.upsert({
    where: { stateCode: 'KG/25C/1359' },
    // Fix name spelling: Pascal → Paschal
    update: { firstName: 'Paschal', isOnboarded: true, isFirstLogin: false },
    create: {
      stateCode: 'KG/25C/1359',
      firstName: 'Paschal',
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
  console.info(`✅ Corper 2: ${corper2.stateCode} — ${corper2.firstName} ${corper2.lastName}`);

  // ── Corpers Connect Official account ─────────────────────────────────────────
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
  console.info(`✅ Official account: ${officialAccount.email}`);

  // ── Mutual follows ────────────────────────────────────────────────────────────
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
  console.info(`✅ Follows seeded`);

  // ── Mami Market: Seller setup for BOTH users ─────────────────────────────────

  // Seller Application — Iniubong (corper1)
  await prisma.sellerApplication.upsert({
    where: { userId: corper1.id },
    update: { status: 'APPROVED', reviewedAt: new Date('2026-03-28T09:00:00Z') },
    create: {
      userId: corper1.id,
      businessName: "Udofot's Mini Market",
      businessDescription:
        'I sell quality everyday items — phones, clothes, food, and household goods — to fellow corps members and residents of Lokoja. Fast delivery within Lokoja available.',
      whatTheySell: 'Electronics, clothes, food, household items',
      idDocUrl: 'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-id-sample.jpg',
      status: 'APPROVED',
      reviewedAt: new Date('2026-03-28T09:00:00Z'),
      reviewNote: 'Valid NYSC ID submitted. Application approved.',
    },
  });

  await prisma.sellerProfile.upsert({
    where: { userId: corper1.id },
    update: {},
    create: {
      userId: corper1.id,
      businessName: "Udofot's Mini Market",
      businessDescription:
        'I sell quality everyday items — phones, clothes, food, and household goods — to fellow corps members and residents of Lokoja. Fast delivery within Lokoja available.',
      whatTheySell: 'Electronics, clothes, food, household items',
      sellerStatus: 'ACTIVE',
    },
  });
  console.info(`✅ Seller setup: ${corper1.firstName} (Udofot's Mini Market)`);

  // Seller Application — Paschal (corper2)
  await prisma.sellerApplication.upsert({
    where: { userId: corper2.id },
    update: { status: 'APPROVED', reviewedAt: new Date('2026-04-01T10:00:00Z') },
    create: {
      userId: corper2.id,
      businessName: "Paschal's Corper Store",
      businessDescription:
        'I sell fairly used and brand-new NYSC-related items including uniforms, boots, camp accessories, electronics, and housing referrals to fellow corps members in Kogi State.',
      whatTheySell: 'NYSC uniforms, boots, camp gear, electronics, housing',
      idDocUrl: 'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-id-sample.jpg',
      status: 'APPROVED',
      reviewedAt: new Date('2026-04-01T10:00:00Z'),
      reviewNote: 'Valid NYSC ID submitted. Application approved.',
    },
  });

  await prisma.sellerProfile.upsert({
    where: { userId: corper2.id },
    update: {},
    create: {
      userId: corper2.id,
      businessName: "Paschal's Corper Store",
      businessDescription:
        'I sell fairly used and brand-new NYSC-related items including uniforms, boots, camp accessories, electronics, and housing referrals to fellow corps members in Kogi State.',
      whatTheySell: 'NYSC uniforms, boots, camp gear, electronics, housing',
      sellerStatus: 'ACTIVE',
    },
  });
  console.info(`✅ Seller setup: ${corper2.firstName} (Paschal's Corper Store)`);

  // ── Marketplace Listings ─────────────────────────────────────────────────────
  // Guard: skip listing seed if already populated to keep seed idempotent
  const existingListingCount = await prisma.marketplaceListing.count({
    where: { sellerId: { in: [corper1.id, corper2.id] } },
  });

  if (existingListingCount >= 50) {
    console.info(`✅ Listings already seeded (${existingListingCount} found) — skipping`);
  } else {
    const U = corper1.id;  // Iniubong Udofot
    const P = corper2.id;  // Paschal Chukwuemerie

    type ListingData = {
      sellerId: string;
      title: string;
      description: string;
      category: string;
      price?: number;
      listingType: string;
      images: string[];
      location: string;
      servingState: string;
      viewCount: number;
    };

    const listings: ListingData[] = [

      // ── ELECTRONICS — Phones (8) ──────────────────────────────────────────────
      {
        sellerId: P,
        title: 'iPhone 13 Pro Max 256GB — Midnight',
        description: 'Apple iPhone 13 Pro Max, 256GB storage, Midnight colour. Screen is perfect — no scratches. Battery health at 91%. Comes with original charger and box. Unlocked to all networks.\n\nSerious buyers only. Price is negotiable for cash payment on the spot.',
        category: 'ELECTRONICS',
        price: 385000,
        listingType: 'FOR_SALE',
        images: [unsplash('1592750475338-74b7b21085ab'), unsplash('1511707171634-5f897ff02aa9')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 87,
      },
      {
        sellerId: U,
        title: 'Samsung Galaxy S23 Ultra 5G',
        description: 'Samsung Galaxy S23 Ultra, 256GB, Phantom Black. Bought brand new 8 months ago. Comes with Samsung S-Pen, original box, and 45W charger. Zero scratches — always in a case.\n\nBattery health excellent. Face ID and fingerprint working perfectly. Kogi buyers preferred.',
        category: 'ELECTRONICS',
        price: 420000,
        listingType: 'FOR_SALE',
        images: [unsplash('1610945415295-d9bbf067e59c'), unsplash('1601784551446-20c326b4aa33')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 103,
      },
      {
        sellerId: P,
        title: 'iPhone 11 64GB (Gently Used) — White',
        description: 'iPhone 11, 64GB, White. Very clean phone — used by a careful owner. No cracks, no dead pixels. iOS updated to latest version. Battery health: 85%.\n\nComes with a charger (not original). Great for someone who wants a reliable iPhone at an affordable price. Pickup in Lokoja.',
        category: 'ELECTRONICS',
        price: 195000,
        listingType: 'FOR_SALE',
        images: [unsplash('1574944985070-8f3ebc0240f6'), unsplash('1512941937669-90a1b58e7e9c')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 61,
      },
      {
        sellerId: U,
        title: 'Infinix Hot 40 Pro — 8GB RAM',
        description: 'Brand new Infinix Hot 40 Pro, 8GB RAM + 256GB storage, sealed in box. Fast gaming phone with 108MP camera and 45W fast charging. Available in Timber Black.\n\nCome see and test before buying. Receipt available. Delivery within Lokoja possible for a small fee.',
        category: 'ELECTRONICS',
        price: 92000,
        listingType: 'FOR_SALE',
        images: [unsplash('1565849904461-04a58ad377e0'), unsplash('1598327105666-5b89351aff97')],
        location: 'Ganaja, Lokoja',
        servingState: 'Kogi State',
        viewCount: 45,
      },
      {
        sellerId: P,
        title: 'Tecno Spark 20C — 128GB (New)',
        description: 'New Tecno Spark 20C. 128GB storage, 8GB RAM. Beautiful 6.56" display, 5000mAh battery that lasts all day. Perfect entry-level phone for corpers on a budget.\n\nSealed in box with warranty card and receipt. Available for pickup immediately.',
        category: 'ELECTRONICS',
        price: 68000,
        listingType: 'FOR_SALE',
        images: [unsplash('1580910051074-3eb694886505'), unsplash('1546614042-7df3c24c9e5d')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 39,
      },
      {
        sellerId: U,
        title: 'iPhone 12 Mini 64GB — Blue',
        description: 'iPhone 12 Mini in Blue. Perfect for those who love compact phones. Screen is flawless — Ceramic Shield front. Battery health 88%. Comes with cable and adapter.\n\nFace ID working. All cameras excellent. Serious buyers, price is firm at ₦185,000.',
        category: 'ELECTRONICS',
        price: 185000,
        listingType: 'FOR_SALE',
        images: [unsplash('1601784551446-20c326b4aa33'), unsplash('1592750475338-74b7b21085ab')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 72,
      },
      {
        sellerId: P,
        title: 'Xiaomi Redmi Note 13 Pro+ 5G',
        description: 'Xiaomi Redmi Note 13 Pro+, 256GB, Midnight Black. 200MP camera, 120W turbo charging — charges from 0-100% in 19 minutes! AMOLED display, 120Hz.\n\nBrand new, just opened for demo. Comes with full accessories in box.',
        category: 'ELECTRONICS',
        price: 148000,
        listingType: 'FOR_SALE',
        images: [unsplash('1598327105666-5b89351aff97'), unsplash('1565849904461-04a58ad377e0')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 29,
      },
      {
        sellerId: U,
        title: 'itel A70 Smartphone — 3GB/64GB',
        description: 'itel A70, 3GB RAM, 64GB storage. Budget-friendly smartphone perfect for basic use — calls, WhatsApp, social media, music. Long-lasting 5000mAh battery.\n\nBrand new in box. Suitable as a backup phone or for elderly family members.',
        category: 'ELECTRONICS',
        price: 38000,
        listingType: 'FOR_SALE',
        images: [unsplash('1546614042-7df3c24c9e5d'), unsplash('1580910051074-3eb694886505')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 18,
      },

      // ── ELECTRONICS — Laptops (4) ─────────────────────────────────────────────
      {
        sellerId: P,
        title: 'MacBook Air M1 (2020) — Space Grey',
        description: 'Apple MacBook Air with M1 chip. 8GB RAM, 256GB SSD. Space Grey. Purchased in 2021, used carefully for work and light programming. No dents or scratches on the body.\n\nBattery cycles: 142. macOS Sonoma installed. Comes with MagSafe charger. Perfect for developers and designers.',
        category: 'ELECTRONICS',
        price: 650000,
        listingType: 'FOR_SALE',
        images: [unsplash('1496181133206-80ce9b88a853'), unsplash('1517336714731-489689fd1ca8')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 134,
      },
      {
        sellerId: U,
        title: 'HP Laptop 15s — Core i5 11th Gen',
        description: 'HP Laptop 15s-eq2, Intel Core i5 11th Gen, 8GB RAM, 512GB SSD, Windows 11 Home. 15.6" Full HD display. Purchased 1 year ago, works perfectly.\n\nIncludes original charger, laptop bag, and mouse. Great for students, corpers, and professionals.',
        category: 'ELECTRONICS',
        price: 285000,
        listingType: 'FOR_SALE',
        images: [unsplash('1587614382346-4ec70e388b28'), unsplash('1496181133206-80ce9b88a853')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 89,
      },
      {
        sellerId: P,
        title: 'Lenovo IdeaPad 3 — Core i3 10th Gen',
        description: 'Lenovo IdeaPad 3, Core i3-1005G1, 8GB RAM, 256GB SSD. Runs fast and smooth. Slightly used — no scratches. Ideal for everyday tasks, school work, and office use.\n\nComes with charger only. Pickup in Lokoja.',
        category: 'ELECTRONICS',
        price: 195000,
        listingType: 'FOR_SALE',
        images: [unsplash('1517336714731-489689fd1ca8'), unsplash('1587614382346-4ec70e388b28')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 55,
      },
      {
        sellerId: U,
        title: 'Dell Inspiron 15 3000 — New (Sealed)',
        description: 'Brand new sealed Dell Inspiron 15 3000 series. AMD Ryzen 5, 8GB RAM, 512GB SSD, Windows 11. 15.6" HD display. Comes with full warranty and original receipt.\n\nExcellent for gaming (light), office work, and studying. Contact for viewing.',
        category: 'ELECTRONICS',
        price: 320000,
        listingType: 'FOR_SALE',
        images: [unsplash('1496181133206-80ce9b88a853'), unsplash('1517336714731-489689fd1ca8')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 47,
      },

      // ── ELECTRONICS — Audio & Accessories (5) ────────────────────────────────
      {
        sellerId: U,
        title: 'AirPods Pro 2nd Generation (MagSafe)',
        description: 'Apple AirPods Pro 2nd Gen with MagSafe charging case. Active Noise Cancellation is incredible — perfect for CDS and noisy environments. Bought 3 months ago, battery health excellent.\n\nComes with original box, all ear tips, and lightning cable. Lokoja pickup only.',
        category: 'ELECTRONICS',
        price: 95000,
        listingType: 'FOR_SALE',
        images: [unsplash('1606741965625-6fef29c7de8a'), unsplash('1590658268037-41d528b78d3c')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 76,
      },
      {
        sellerId: P,
        title: 'Sony WH-1000XM4 Wireless Headphones',
        description: "Sony's best noise-cancelling headphones. 30-hour battery, industry-leading ANC. Used for only 4 months — in perfect condition. Comes with original carry case, cables, and box.\n\nPairing with two devices simultaneously works great. Selling because I upgraded to XM5.",
        category: 'ELECTRONICS',
        price: 88000,
        listingType: 'FOR_SALE',
        images: [unsplash('1583394838336-acd977736f90'), unsplash('1505740420928-5e560c06d30e')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 63,
      },
      {
        sellerId: U,
        title: 'JBL Charge 5 Bluetooth Speaker',
        description: 'JBL Charge 5 portable waterproof speaker (IP67). Deep bass, 20-hour playtime. Doubles as a power bank to charge your phone. Used twice — sounds incredible.\n\nComes with original charging cable and box. Teal/Green colour. Perfect for outdoor activities and parties.',
        category: 'ELECTRONICS',
        price: 38000,
        listingType: 'FOR_SALE',
        images: [unsplash('1608043152269-52b4ca178f0b'), unsplash('1545454675-3479531948ef')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 41,
      },
      {
        sellerId: P,
        title: 'Anker PowerCore 20000mAh Power Bank',
        description: 'Anker PowerCore power bank, 20000mAh — charges your phone 4-5 times on one charge. Dual USB ports + USB-C. Super slim design fits in any bag.\n\nBrand new, still in original packaging. Essential for corpers dealing with power cuts in Lokoja!',
        category: 'ELECTRONICS',
        price: 22000,
        listingType: 'FOR_SALE',
        images: [unsplash('1609592173046-06b0b9b67e09'), unsplash('1556742049-0cfed4f6a45d')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 28,
      },
      {
        sellerId: U,
        title: 'Ring Light 18" + Phone Tripod Stand',
        description: 'Professional 18-inch ring light with adjustable colour temperature (3 modes: warm, daylight, cool). Comes with 2-metre tripod, phone holder, and remote control.\n\nBrand new in box. Perfect for content creators, zoom calls, and TikTok. Assembles in 2 minutes.',
        category: 'ELECTRONICS',
        price: 18500,
        listingType: 'FOR_SALE',
        images: [unsplash('1516035069371-29a1b244cc32'), unsplash('1492691527719-9d1e07e534b4')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 35,
      },

      // ── HOUSING (20) ──────────────────────────────────────────────────────────
      {
        sellerId: P,
        title: 'Self-Contained Room — Felele, Lokoja',
        description: "Spacious self-contained room available for rent in Felele. Comes with private bathroom & toilet, kitchen space, and secure compound. Security guard on premises.\n\nFree water supply. Close to main road with easy access to public transport. Ideal for corpers and young professionals.\n\nRent: ₦350,000/year.",
        category: 'HOUSING',
        price: 350000,
        listingType: 'FOR_RENT',
        images: [unsplash('1522708323590-d24dbb6b0267'), unsplash('1507089947368-19c1da9775ae')],
        location: 'Felele, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 210,
      },
      {
        sellerId: U,
        title: '1-Bedroom Flat — Ganaja Village',
        description: '1-bedroom flat available in Ganaja Village. Includes separate sitting room, bedroom, kitchen, and bathroom. Pre-paid meter installed.\n\nQuiet and serene environment. 10-minute drive to NYSC Secretariat. Suitable for couple or single corper. Agent fee applies.',
        category: 'HOUSING',
        price: 280000,
        listingType: 'FOR_RENT',
        images: [unsplash('1502672260266-1c1ef2d93688'), unsplash('1493809842364-ec10cf3d3d13')],
        location: 'Ganaja, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 187,
      },
      {
        sellerId: P,
        title: '2-Bedroom Apartment — Lokoja GRA',
        description: '2-bedroom apartment in the prestigious GRA Lokoja. Tiled floors, ceiling fans in all rooms, fitted kitchen, and large compound with parking space.\n\nEstimated rent: ₦450,000/year. Borehole water available. Security estate. Inspection available on request.',
        category: 'HOUSING',
        price: 450000,
        listingType: 'FOR_RENT',
        images: [unsplash('1560448204-e02f11c3d0e2'), unsplash('1484154218962-a197022b5858')],
        location: 'GRA, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 156,
      },
      {
        sellerId: U,
        title: 'Mini Flat (BQ Style) — Adankolo',
        description: 'Nice mini flat in Adankolo. Room + parlour layout with private kitchen and bathroom. Very clean compound with CCTV. Pre-paid electricity meter.\n\nRent: ₦320,000/year. No agents — direct from owner. Available immediately.',
        category: 'HOUSING',
        price: 320000,
        listingType: 'FOR_RENT',
        images: [unsplash('1505691938895-1758d7feb511'), unsplash('1522708323590-d24dbb6b0267')],
        location: 'Adankolo, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 142,
      },
      {
        sellerId: P,
        title: 'Boys Quarters — Kabba Road',
        description: 'Clean self-contained boys quarters available for rent. Includes bathroom, toilet, and separate entrance. Shared compound with 2 other tenants.\n\nRent: ₦180,000/year or ₦16,000/month. Water available. Suitable for single corper on a budget.',
        category: 'HOUSING',
        price: 180000,
        listingType: 'FOR_RENT',
        images: [unsplash('1507089947368-19c1da9775ae'), unsplash('1516455207474-bba2c7f29cde')],
        location: 'Kabba Road, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 98,
      },
      {
        sellerId: U,
        title: 'Corper-Friendly Room — Near NYSC Secretariat',
        description: 'Looking for a room close to the NYSC Secretariat? This is it! Clean, furnished room with 24/7 security. Shared kitchen and bathroom.\n\nRent: ₦7,500/month (₦90,000/year). Water and electricity inclusive. Perfect for corps members just arriving in Lokoja.',
        category: 'HOUSING',
        price: 90000,
        listingType: 'FOR_RENT',
        images: [unsplash('1493809842364-ec10cf3d3d13'), unsplash('1502672260266-1c1ef2d93688')],
        location: 'Lokoja Secretariat Area, Kogi State',
        servingState: 'Kogi State',
        viewCount: 267,
      },
      {
        sellerId: P,
        title: 'Furnished Studio Apartment — Phase 1 Lokoja',
        description: 'Fully furnished studio apartment for rent. Includes bed frame, mattress, wardrobe, reading table, and fan. Pre-paid electricity.\n\nRent: ₦400,000/year. Furniture can be removed if you prefer unfurnished. Contact for inspection.',
        category: 'HOUSING',
        price: 400000,
        listingType: 'FOR_RENT',
        images: [unsplash('1558618666-fcd25c85cd64'), unsplash('1560448204-e02f11c3d0e2')],
        location: 'Phase 1, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 121,
      },
      {
        sellerId: U,
        title: '3-Bedroom Flat — Zango District',
        description: '3-bedroom flat in Zango, Lokoja. Sitting room, dining area, 2 bathrooms (master en suite), and kitchen. Large compound with garden.\n\nRent: ₦550,000/year. Perfect for a family or group of corpers sharing. Borehole water and pre-paid meter.',
        category: 'HOUSING',
        price: 550000,
        listingType: 'FOR_RENT',
        images: [unsplash('1516455207474-bba2c7f29cde'), unsplash('1484154218962-a197022b5858')],
        location: 'Zango, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 88,
      },
      {
        sellerId: P,
        title: 'Room to Let — Tudun Wada (Monthly)',
        description: 'Room available for monthly rent in Tudun Wada. Secured compound, reliable water supply, and pre-paid electricity. Suitable for singles.\n\nRent: ₦9,000/month. Short-let also available. Call to view.',
        category: 'HOUSING',
        price: 108000,
        listingType: 'FOR_RENT',
        images: [unsplash('1505691938895-1758d7feb511'), unsplash('1507089947368-19c1da9775ae')],
        location: 'Tudun Wada, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 74,
      },
      {
        sellerId: U,
        title: 'Spacious Self-Contain — Sharade Junction',
        description: 'Large self-contained apartment near Sharade Junction. Includes private kitchen, bathroom, and a small balcony. Great natural ventilation — no need for AC.\n\nRent: ₦280,000/year. Quiet neighbourhood, good security. Corpers are welcome.',
        category: 'HOUSING',
        price: 280000,
        listingType: 'FOR_RENT',
        images: [unsplash('1502672260266-1c1ef2d93688'), unsplash('1558618666-fcd25c85cd64')],
        location: 'Sharade, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 93,
      },
      {
        sellerId: P,
        title: '1-Bedroom Flat — New Lokoja Layout',
        description: 'Beautiful 1-bedroom flat in the new Lokoja layout. Modern finishing, tiled floors, and flush doors. Pre-paid meter and borehole water.\n\nRent: ₦260,000/year. Ready for immediate occupancy. No hidden charges.',
        category: 'HOUSING',
        price: 260000,
        listingType: 'FOR_RENT',
        images: [unsplash('1493809842364-ec10cf3d3d13'), unsplash('1560448204-e02f11c3d0e2')],
        location: 'New Layout, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 108,
      },
      {
        sellerId: U,
        title: 'Corper Lodge — All Rooms Available',
        description: 'Running a corper lodge with multiple rooms available. Shared kitchen, bathroom (maintained daily), and 24/7 security. WiFi on request.\n\nRent from ₦6,000/month. Great for new arrivals and batch mates. Close to NYSC camp road.',
        category: 'HOUSING',
        price: 72000,
        listingType: 'FOR_RENT',
        images: [unsplash('1507089947368-19c1da9775ae'), unsplash('1516455207474-bba2c7f29cde')],
        location: 'NYSC Road, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 195,
      },

      // ── FOOD (18) ─────────────────────────────────────────────────────────────
      {
        sellerId: P,
        title: 'Home-Cooked Jollof Rice + Chicken (Plate)',
        description: 'Delicious party-style jollof rice cooked with tomatoes, peppers, and aromatic spices. Served with a full chicken piece and coleslaw on the side.\n\nOrders must be placed by 10am for same-day delivery within Lokoja. ₦1,500/plate. Minimum 2 plates per order.',
        category: 'FOOD',
        price: 1500,
        listingType: 'FOR_SALE',
        images: [unsplash('1567620905732-2d1ec7ab7445'), unsplash('1504674900247-0877df9cc836')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 312,
      },
      {
        sellerId: U,
        title: 'Shawarma + Cold Drink Combo',
        description: 'Fresh chicken shawarma made to order with coleslaw, sauce, and veggies. Served in pita bread. Combo includes a 35cl cold drink of your choice.\n\nAvailable from 12pm–9pm daily. Delivery within Ganaja/Lokoja central. ₦2,500/combo.',
        category: 'FOOD',
        price: 2500,
        listingType: 'FOR_SALE',
        images: [unsplash('1565299624946-b28f40a0ae38'), unsplash('1481671703844-040240b4fa2b')],
        location: 'Ganaja, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 285,
      },
      {
        sellerId: P,
        title: 'Fried Chicken & Chips (2 Pieces)',
        description: 'Crispy Southern-style fried chicken — 2 large pieces served with seasoned chips and a spicy dipping sauce. Cooked fresh on order.\n\nAvailable daily 11am–8pm. ₦2,000 per pack. Delivery available for orders of 3+ packs.',
        category: 'FOOD',
        price: 2000,
        listingType: 'FOR_SALE',
        images: [unsplash('1562967916-eb82221dfb92'), unsplash('1490645935967-10de6ba17061')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 178,
      },
      {
        sellerId: U,
        title: 'Fresh Meat Pie (6 Pieces) — ₦3,000',
        description: 'Freshly baked meat pies filled with well-seasoned ground beef, diced potatoes, and carrots. Crispy pastry, soft filling. Baked every morning by 8am.\n\n₦3,000 for 6 pieces. Sold in packs only. Pickup at Ganaja or delivery for orders of 2+ packs.',
        category: 'FOOD',
        price: 3000,
        listingType: 'FOR_SALE',
        images: [unsplash('1509722747041-616f39b57569'), unsplash('1565958011703-44f9829ba187')],
        location: 'Ganaja, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 143,
      },
      {
        sellerId: P,
        title: 'Homemade Chin Chin (500g) — Crunchy',
        description: 'Classic Nigerian chin chin — crunchy, sweet, and perfectly seasoned. Made fresh every week in a clean, hygienic kitchen. No artificial preservatives.\n\n₦1,200 for 500g pack. ₦2,200 for 1kg. Great for snacking, gifting, or selling. Bulk orders welcome!',
        category: 'FOOD',
        price: 1200,
        listingType: 'FOR_SALE',
        images: [unsplash('1512621776951-a57141f2eefd'), unsplash('1490474504059-0df28e1e1d55')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 89,
      },
      {
        sellerId: U,
        title: 'Freshly Made Smoothies (500ml)',
        description: 'Freshly blended smoothies made with real fruits — no artificial flavours. Available flavours: Mango-Pineapple, Watermelon-Mint, Banana-Berry, and Mixed Fruits.\n\n₦800 per bottle (500ml). Order by 7am for same-day supply. Cold and delicious — perfect for Lokoja heat!',
        category: 'FOOD',
        price: 800,
        listingType: 'FOR_SALE',
        images: [unsplash('1553530979-fbb9e4aee36f'), unsplash('1476224203421-9ac39bcb3327')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 201,
      },
      {
        sellerId: P,
        title: 'Egusi Soup + Poundo Yam (Delivery)',
        description: 'Freshly cooked egusi soup made with palm oil, stockfish, beef, and pomo. Served with perfectly smooth poundo yam.\n\nHome delivery available within Lokoja. Order by 11am for afternoon delivery, or by 3pm for evening. ₦2,500/portion. Minimum 2 portions.',
        category: 'FOOD',
        price: 2500,
        listingType: 'FOR_SALE',
        images: [unsplash('1540189549336-e6e99c3679fe'), unsplash('1567620905732-2d1ec7ab7445')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 167,
      },
      {
        sellerId: U,
        title: 'Birthday & Celebration Cakes (Custom)',
        description: 'Beautiful custom cakes for birthdays, graduations, and celebrations. Made with quality ingredients — real butter, fresh eggs, and imported flour.\n\nMinimum order: ₦8,500 for a 7-inch 2-layer cake. 3D sculpted and tiered cakes available. Order at least 3 days in advance. Tasting session available!',
        category: 'FOOD',
        price: 8500,
        listingType: 'FOR_SALE',
        images: [unsplash('1558618666-fcd25c85cd64'), unsplash('1578985545062-126578f4bfb3')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 224,
      },
      {
        sellerId: P,
        title: 'Roasted Groundnut (Peanuts) — 1kg',
        description: 'Fresh roasted peanuts — properly seasoned with a hint of salt. Crunchy and natural. No additives.\n\n₦1,500 for 1kg. Also available in 500g (₦800) and 250g (₦450) packs. Perfect for snacking at CDS or your PPA. Wholesale available.',
        category: 'FOOD',
        price: 1500,
        listingType: 'FOR_SALE',
        images: [unsplash('1567704559523-5bc22ea7c95a'), unsplash('1484723091739-30990b7286ff')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 97,
      },
      {
        sellerId: U,
        title: 'Beef Suya (Per Stick/Wrap)',
        description: 'Authentic Northern-style suya made from thinly sliced beef marinated in yaji spice, roasted over open fire. Served with sliced onions and tomatoes.\n\n₦500 per stick, ₦2,500 for full wrap (5 sticks). Available evenings from 6pm–10pm daily. Location: Lokoja roadside stand.',
        category: 'FOOD',
        price: 500,
        listingType: 'FOR_SALE',
        images: [unsplash('1565958011703-44f9829ba187'), unsplash('1504674900247-0877df9cc836')],
        location: 'Lokoja Central, Kogi State',
        servingState: 'Kogi State',
        viewCount: 389,
      },
      {
        sellerId: P,
        title: 'Zobo Drink (1 Litre Bottle)',
        description: 'Refreshing zobo drink made from dried hibiscus flowers, ginger, cloves, and pineapple juice. Chilled and bottled hygienically.\n\n₦700 per litre. Also available in 1.5L (₦1,000). Minimum order: 3 bottles. Bulk orders (10+ bottles) at discounted price.',
        category: 'FOOD',
        price: 700,
        listingType: 'FOR_SALE',
        images: [unsplash('1553530979-fbb9e4aee36f'), unsplash('1474722883778-792e7fd62b3f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 134,
      },
      {
        sellerId: U,
        title: 'Snack Pack (CDS/Office) — 10 Items',
        description: 'Pre-packed snack boxes ideal for CDS activities, office events, and seminars. Each box contains: 2 meat pies, 2 chin chin packs, 2 drinks, 2 biscuits, and 2 yoghurt cups.\n\n₦5,000 per box. Minimum 5 boxes per order. 48-hour advance booking required.',
        category: 'FOOD',
        price: 5000,
        listingType: 'FOR_SALE',
        images: [unsplash('1490474504059-0df28e1e1d55'), unsplash('1512621776951-a57141f2eefd')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 75,
      },
      {
        sellerId: P,
        title: 'Kunu Drink (1.5 Litre)',
        description: 'Fresh Kunu (millet/guinea corn drink) made daily. Lightly sweetened, nutritious, and refreshing. Great alternative to sugary drinks.\n\n₦600 for 1.5L. Available Mon–Sat from 7am–5pm. Pickup at Lokoja main market area or delivery for 3+ bottles.',
        category: 'FOOD',
        price: 600,
        listingType: 'FOR_SALE',
        images: [unsplash('1476224203421-9ac39bcb3327'), unsplash('1553530979-fbb9e4aee36f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 88,
      },

      // ── CLOTHES (15) ──────────────────────────────────────────────────────────
      {
        sellerId: U,
        title: 'Male Ankara Senator Set (M/L)',
        description: 'Beautiful hand-stitched senator top and matching trouser in vibrant Ankara print. Available in sizes M and L. Perfect for CDS outings, events, and church.\n\nMaterial is high-quality Dutch wax fabric. Can be custom-made to your measurements. Delivery available.',
        category: 'OTHERS',
        price: 12000,
        listingType: 'FOR_SALE',
        images: [unsplash('1523381210434-271e8be1f52b'), unsplash('1489987707025-afc232f7ea0f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 156,
      },
      {
        sellerId: P,
        title: 'Female Ankara Midi Gown — Size 12',
        description: "Gorgeous Ankara midi gown, size 12 (UK sizing). Flared skirt, fitted bodice. Vibrant yellow and green print. Worn once to a friend's wedding — still in perfect condition.\n\n₦9,500 or best offer. Can be taken in/out by a tailor. Pickup in Lokoja.",
        category: 'OTHERS',
        price: 9500,
        listingType: 'FOR_SALE',
        images: [unsplash('1620799140408-edc6dcb6d633'), unsplash('1516762689617-e1cffcef479d')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 89,
      },
      {
        sellerId: U,
        title: '3-Piece Corporate Suit — Male (Size 40)',
        description: "Men's 3-piece corporate suit — jacket, trousers, and waistcoat. Navy blue pinstripe. Size 40 chest. Used for one event, dry-cleaned immediately after.\n\nSelling with a free matching tie. Perfect for interviews, PPA formal events, and weddings. ₦35,000.",
        category: 'OTHERS',
        price: 35000,
        listingType: 'FOR_SALE',
        images: [unsplash('1507003211169-0a1dd7228f2d'), unsplash('1494790108377-be9c29b29330')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 74,
      },
      {
        sellerId: P,
        title: "Female Blazer + Trouser Set (Size 10)",
        description: "Smart female power suit — white blazer and black tailored trousers. Size 10 (UK). Never worn, bought for an event that was cancelled.\n\n₦18,000. Great for office, PPA, and formal occasions. Professional and stylish look.",
        category: 'OTHERS',
        price: 18000,
        listingType: 'FOR_SALE',
        images: [unsplash('1551232864-3f0890e580d9'), unsplash('1523381210434-271e8be1f52b')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 61,
      },
      {
        sellerId: U,
        title: 'Plain Polo T-Shirts (Pack of 3)',
        description: 'Quality cotton polo shirts — 3-pack. Available in: White+Black+Navy, White+Grey+Maroon, or White+Olive+Burgundy combinations.\n\n₦7,500 for a 3-pack. Breathable fabric, perfect for Lokoja heat. Sizes S, M, L, XL available. Also sold individually at ₦2,800.',
        category: 'OTHERS',
        price: 7500,
        listingType: 'FOR_SALE',
        images: [unsplash('1489987707025-afc232f7ea0f'), unsplash('1523381210434-271e8be1f52b')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 112,
      },
      {
        sellerId: P,
        title: "Men's Slim-Fit Jeans — Size 32",
        description: "Classic slim-fit jeans in mid-blue wash. Size 32 waist, 32 leg. Brand: Levi's-style cut (unbranded but excellent quality). Used 3 times — still looks new.\n\n₦8,500 or best offer. Great casual wear for weekends and outings.",
        category: 'OTHERS',
        price: 8500,
        listingType: 'FOR_SALE',
        images: [unsplash('1542291026-7eec264c27ff'), unsplash('1489987707025-afc232f7ea0f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 43,
      },
      {
        sellerId: U,
        title: 'Female Casual Summer Dress — Size 10',
        description: 'Light floral summer dress, perfect for the Lokoja heat. 100% cotton, midi length. Comes with a matching fabric belt. Size 10.\n\n₦6,500. Barely worn — bought two of the same and selling one. Machine washable.',
        category: 'OTHERS',
        price: 6500,
        listingType: 'FOR_SALE',
        images: [unsplash('1620799140408-edc6dcb6d633'), unsplash('1551232864-3f0890e580d9')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 68,
      },
      {
        sellerId: P,
        title: 'Male Kaftan + Cap (Traditional)',
        description: 'Elegant male Kaftan with matching cap. White with embroidery detail at collar and sleeves. Size L/XL. Made from quality lace material.\n\n₦15,000 for the full set. Perfect for Fridays, Eid celebrations, and traditional events.',
        category: 'OTHERS',
        price: 15000,
        listingType: 'FOR_SALE',
        images: [unsplash('1507003211169-0a1dd7228f2d'), unsplash('1523381210434-271e8be1f52b')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 52,
      },
      {
        sellerId: U,
        title: 'Unisex Zip-Up Hoodie — Black (Size M)',
        description: 'Heavy fleece zip-up hoodie in black. Size M. Kangaroo pocket, ribbed cuffs. Thick and warm — great for cool Lokoja evenings and harmattan season.\n\n₦9,000. Used twice. Still very fluffy and comfortable. Machine washable.',
        category: 'OTHERS',
        price: 9000,
        listingType: 'FOR_SALE',
        images: [unsplash('1556821840-3a63f15732d1'), unsplash('1489987707025-afc232f7ea0f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 37,
      },
      {
        sellerId: P,
        title: 'Full Agbada Set — Cream/Gold (Custom)',
        description: 'Full flowing Agbada set — cap, buba, sokoto, and outer robe. Cream colour with intricate gold embroidery. Custom-made by a skilled tailor.\n\nCan be remade to your measurements. Starting price: ₦28,000. Allow 7–10 days for production.',
        category: 'OTHERS',
        price: 28000,
        listingType: 'FOR_SALE',
        images: [unsplash('1507003211169-0a1dd7228f2d'), unsplash('1516762689617-e1cffcef479d')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 45,
      },

      // ── SHOES (12) ────────────────────────────────────────────────────────────
      {
        sellerId: U,
        title: 'Nike Air Force 1 Low — White (Size 42)',
        description: "Classic Nike Air Force 1 Low in all-white. Size 42 (EU) / Size 8 (UK). Bought 6 months ago — used about 10 times. Cleaned and boxed.\n\nSoles are clean, no yellowing. Original box included. ₦35,000. Authentic — receipt available.",
        category: 'OTHERS',
        price: 35000,
        listingType: 'FOR_SALE',
        images: [unsplash('1542291026-7eec264c27ff'), unsplash('1595950653106-6c9ebd614d3a')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 145,
      },
      {
        sellerId: P,
        title: "Adidas Ultraboost 22 — Size 41",
        description: "Adidas Ultraboost 22 in Core Black. Size 41 (EU) / Size 7 UK. Best running shoe you'll ever own — cloud-like cushioning. Used for 3 months before foot injury.\n\n₦48,000. Original box and receipt. Minor scuff on left toe — priced accordingly.",
        category: 'OTHERS',
        price: 48000,
        listingType: 'FOR_SALE',
        images: [unsplash('1460353581641-37baddab0fa2'), unsplash('1542291026-7eec264c27ff')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 98,
      },
      {
        sellerId: U,
        title: "Women's Block Heel Court Shoes — Size 38",
        description: "Elegant block-heel court shoes in nude/beige. Size 38 (EU) / Size 5 (UK). 7cm heel height — comfortable for all-day wear.\n\nWorn twice to office events. Still in excellent condition. ₦12,000 or best offer.",
        category: 'OTHERS',
        price: 12000,
        listingType: 'FOR_SALE',
        images: [unsplash('1491553895911-0055eca6402d'), unsplash('1595950653106-6c9ebd614d3a')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 63,
      },
      {
        sellerId: P,
        title: "Men's Brown Leather Oxford Shoes — Size 43",
        description: "Classic men's full-grain leather Oxford shoes in tan/brown. Size 43 (EU) / Size 9 (UK). Rubber sole with leather lining. Purchased from a reputable store.\n\nPolished and conditioned. ₦22,000. Perfect for PPA, church, and formal events.",
        category: 'OTHERS',
        price: 22000,
        listingType: 'FOR_SALE',
        images: [unsplash('1567401893414-76b7b1e5a7a5'), unsplash('1460353581641-37baddab0fa2')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 51,
      },
      {
        sellerId: U,
        title: 'Birkenstock Arizona Sandals — Unisex Size 40',
        description: 'Authentic Birkenstock Arizona Two-Strap sandals. EVA sole (lightweight, waterproof). Size 40 EU. Used occasionally for about 2 months.\n\nStill very clean and comfortable. ₦18,500. Great for casual wear and walking around Lokoja.',
        category: 'OTHERS',
        price: 18500,
        listingType: 'FOR_SALE',
        images: [unsplash('1506629082955-511b1aa562c8'), unsplash('1491553895911-0055eca6402d')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 77,
      },
      {
        sellerId: P,
        title: 'Puma RS-X Running Sneakers — Size 42',
        description: 'Puma RS-X in White/Blue colourway. Size 42 EU. Retro chunky sole, breathable mesh upper. Bought brand new 2 months ago — worn 5 times.\n\n₦28,000. Comes in original box. No creases, no stains.',
        category: 'OTHERS',
        price: 28000,
        listingType: 'FOR_SALE',
        images: [unsplash('1595950653106-6c9ebd614d3a'), unsplash('1542291026-7eec264c27ff')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 44,
      },
      {
        sellerId: U,
        title: "Converse Chuck Taylor All Star — Size 38",
        description: "Classic Converse Chuck Taylor All Star High-Top in Black. Size 38 EU / Size 5 UK. Brand new — never worn, still has tissue paper in the box.\n\n₦25,000. Authentic Converse. Original box included.",
        category: 'OTHERS',
        price: 25000,
        listingType: 'FOR_SALE',
        images: [unsplash('1463100099107-aa0980ccd584'), unsplash('1542291026-7eec264c27ff')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 58,
      },

      // ── HOUSE ITEMS (12) ──────────────────────────────────────────────────────
      {
        sellerId: P,
        title: 'Binatone 18" Standing Fan',
        description: 'Binatone 18-inch standing fan with 3 speed settings and oscillation. Works perfectly — just upgraded to a tower fan so selling this.\n\n₦22,000. Collected from clean indoor use only. Available for pickup in Lokoja.',
        category: 'OTHERS',
        price: 22000,
        listingType: 'FOR_SALE',
        images: [unsplash('1558618048-fdd81c7fa634'), unsplash('1545774639-977d9b6f98b4')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 92,
      },
      {
        sellerId: U,
        title: 'Nunix 2-Burner Gas Cooker (Table Top)',
        description: 'Nunix 2-burner tabletop gas cooker — stainless steel finish. Both burners work perfectly. Gas hose included. Clean and ready to use.\n\n₦28,500. Ideal for corpers in self-contained rooms. Pick up at Ganaja, Lokoja.',
        category: 'OTHERS',
        price: 28500,
        listingType: 'FOR_SALE',
        images: [unsplash('1484154218962-a197022b5858'), unsplash('1556909114-f6e7ad7d3136')],
        location: 'Ganaja, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 134,
      },
      {
        sellerId: P,
        title: '6x4 Foam Mattress — Medium Density',
        description: 'High-quality 6x4 foam mattress, medium density (8 inches thick). Never been used — bought as a spare but no longer needed.\n\n₦35,000 (retail price is ₦52,000). Comes wrapped in original plastic. Pickup in Lokoja only — no delivery (too bulky).',
        category: 'OTHERS',
        price: 35000,
        listingType: 'FOR_SALE',
        images: [unsplash('1555529902-5261145633bf'), unsplash('1586023492125-27b2c045efd7')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 165,
      },
      {
        sellerId: U,
        title: 'Plastic Wardrobe with Mirror — 2-Door',
        description: '2-door plastic wardrobe with full-length mirror on front door. Plenty of storage space — shelves inside for folded items and hanging rail.\n\n₦15,000. In excellent condition — selling because I\'m leaving service. Pickup at Lokoja.',
        category: 'OTHERS',
        price: 15000,
        listingType: 'FOR_SALE',
        images: [unsplash('1555041469-a586c61ea9bc'), unsplash('1558618666-fcd25c85cd64')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 111,
      },
      {
        sellerId: P,
        title: 'Complete Kitchen Utensil Set (20 Pieces)',
        description: '20-piece kitchen set including: pots (3 sizes), frying pan, wooden spoons, ladle, colander, peeler, and more. All in very good condition.\n\n₦8,500 for the complete set. Selling individual pieces not available. Pickup in Lokoja.',
        category: 'OTHERS',
        price: 8500,
        listingType: 'FOR_SALE',
        images: [unsplash('1556909114-f6e7ad7d3136'), unsplash('1484154218962-a197022b5858')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 78,
      },
      {
        sellerId: U,
        title: 'Scanfrost 16" Ceiling Fan (With Remote)',
        description: 'Scanfrost 16-inch ceiling fan with remote control. 5 reversible wooden blades, 3 speed settings, and LED light kit included. Never installed — still in box.\n\n₦18,000 (bought at ₦27,000). Full fittings included. Pickup at Ganaja.',
        category: 'OTHERS',
        price: 18000,
        listingType: 'FOR_SALE',
        images: [unsplash('1558618048-fdd81c7fa634'), unsplash('1545774639-977d9b6f98b4')],
        location: 'Ganaja, Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 55,
      },
      {
        sellerId: P,
        title: 'Dining Table + 4 Chairs — Wooden',
        description: 'Solid wooden dining set — rectangular table (4-seater) with 4 matching chairs. Dark walnut finish. Slightly used, no scratches.\n\n₦55,000 for the full set. Great for 1-bedroom flats and self-contains. Buyer arranges transport — Lokoja only.',
        category: 'OTHERS',
        price: 55000,
        listingType: 'FOR_SALE',
        images: [unsplash('1555041469-a586c61ea9bc'), unsplash('1556909114-f6e7ad7d3136')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 87,
      },
      {
        sellerId: U,
        title: 'Mini Bar Fridge — 60L (LG Brand)',
        description: "LG 60-litre single-door mini fridge. Perfect size for a corper's room — stores drinks, fruits, and leftover food. Energy efficient. Runs quietly.\n\n₦85,000. 1 year old, in excellent working condition. Comes with original receipt.",
        category: 'OTHERS',
        price: 85000,
        listingType: 'FOR_SALE',
        images: [unsplash('1585771724684-38269d6639fd'), unsplash('1484154218962-a197022b5858')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 143,
      },
      {
        sellerId: P,
        title: 'Philips Steam Iron — 2000W',
        description: 'Philips GC1905 2000W steam iron. Non-stick soleplate with continuous steam. Works perfectly — selling because I bought a newer model.\n\n₦7,500. Comes with original box. Ideal for corpers who want to always look sharp at PPA!',
        category: 'OTHERS',
        price: 7500,
        listingType: 'FOR_SALE',
        images: [unsplash('1545774639-977d9b6f98b4'), unsplash('1558618048-fdd81c7fa634')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 62,
      },
      {
        sellerId: U,
        title: 'Blender + Juicer Combo (Nunix)',
        description: 'Nunix 2-in-1 multi-function blender and juicer. 3 speed settings + pulse. 1.5L blending jar and 0.8L juicer attachment. Makes smoothies, groundnut paste, and pepper blends.\n\n₦12,000. 4 months old, works perfectly. Selling because relocating.',
        category: 'OTHERS',
        price: 12000,
        listingType: 'FOR_SALE',
        images: [unsplash('1556909114-f6e7ad7d3136'), unsplash('1476224203421-9ac39bcb3327')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 88,
      },

      // ── NYSC UNIFORM (5) ──────────────────────────────────────────────────────
      {
        sellerId: P,
        title: 'NYSC Khaki Uniform — Size M (Gently Used)',
        description: "Selling my NYSC khaki uniform, size Medium. Only worn twice during CDS activities — still very clean and in excellent condition. Comes with the full set: trousers, shirt, and beret. Perfect for corps members who missed the camp issue or need a spare.\n\nPickup in Lokoja (NYSC Secretariat area preferred). Serious buyers only.",
        category: 'UNIFORM',
        price: 4500,
        listingType: 'FOR_SALE',
        images: [
          'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-uniform-1.jpg',
          'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-uniform-2.jpg',
        ],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 14,
      },
      {
        sellerId: U,
        title: 'NYSC Jungle Boots — Size 42 (New)',
        description: "Brand new NYSC jungle boots, size 42 (EU). Never worn — received two pairs at camp. Proper black leather upper with rubber sole. Standard NYSC issue.\n\n₦8,500. Will save you from the camp drama of finding your size. Pickup at Lokoja.",
        category: 'UNIFORM',
        price: 8500,
        listingType: 'FOR_SALE',
        images: [unsplash('1506629082955-511b1aa562c8'), unsplash('1567401893414-76b7b1e5a7a5')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 32,
      },
      {
        sellerId: P,
        title: 'NYSC Jungle Boot — Size 40 (Used Once)',
        description: 'NYSC jungle boot size 40 (EU) — worn once during camp. Still very clean and in good shape. Genuine leather upper.\n\n₦5,000. Cheaper than camp price and already broken-in. Contact to view before purchase.',
        category: 'UNIFORM',
        price: 5000,
        listingType: 'FOR_SALE',
        images: [unsplash('1567401893414-76b7b1e5a7a5'), unsplash('1506629082955-511b1aa562c8')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 21,
      },
      {
        sellerId: U,
        title: 'NYSC White Vest Pack (3 Pieces)',
        description: 'Pack of 3 NYSC official white vests. Size M. Barely used — only worn 2 days during camp parade. Washed and neatly packed.\n\n₦2,500 for all 3. Individual pieces not split. Pickup at Lokoja.',
        category: 'UNIFORM',
        price: 2500,
        listingType: 'FOR_SALE',
        images: [unsplash('1489987707025-afc232f7ea0f'), unsplash('1523381210434-271e8be1f52b')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 17,
      },
      {
        sellerId: P,
        title: 'NYSC Khaki Trousers Only — Size L',
        description: 'NYSC khaki trousers in size Large. Clean, no tears or stains. Selling because I received an extra pair from a batch mate.\n\n₦3,000. Can meet at NYSC Secretariat for exchange. WhatsApp preferred for quick response.',
        category: 'UNIFORM',
        price: 3000,
        listingType: 'FOR_SALE',
        images: [
          'https://res.cloudinary.com/demo/image/upload/v1/corpers_connect/demo/nysc-uniform-1.jpg',
        ],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 9,
      },

      // ── SERVICES (5) ──────────────────────────────────────────────────────────
      {
        sellerId: U,
        title: 'Private Tutoring — Maths & English (O-Level)',
        description: "Private lesson teacher for JSS1–SS3 students. Specialised in Mathematics and English Language. 5+ years teaching experience.\n\n₦5,000 per session (1.5 hours), or ₦18,000/month (4 sessions). Home visits within Lokoja or online via Google Meet. Contact to schedule a free trial session!",
        category: 'SERVICES',
        price: 5000,
        listingType: 'SERVICE',
        images: [unsplash('1454165804606-c3d57bc86b40'), unsplash('1503676260728-1c00da094a0b')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 178,
      },
      {
        sellerId: P,
        title: 'Event Photography — Portraits & Occasions',
        description: 'Professional photography services for all types of events: birthdays, weddings, CDS activities, graduations, and corporate events.\n\nPackages start at ₦15,000 for 2-hour coverage with 30 edited photos delivered digitally. Full-day packages available. Portfolio available on request. Book early!',
        category: 'SERVICES',
        price: 15000,
        listingType: 'SERVICE',
        images: [unsplash('1502920514313-9153a3b1b285'), unsplash('1516035069371-29a1b244cc32')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 142,
      },
      {
        sellerId: U,
        title: 'Weekly Laundry & Ironing Service',
        description: 'Too busy with PPA or CDS to do laundry? I offer a weekly laundry pickup and delivery service within Lokoja.\n\n₦2,500/week (up to 15 items). Clothes washed, dried, and ironed. Pickup Monday, return Wednesday. Clean, organized, and reliable. Contact to subscribe!',
        category: 'SERVICES',
        price: 2500,
        listingType: 'SERVICE',
        images: [unsplash('1545173168-9f1947eebb7f'), unsplash('1489987707025-afc232f7ea0f')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 203,
      },
      {
        sellerId: P,
        title: 'Delivery Service — Lokoja & Environs',
        description: 'Fast and reliable dispatch service within Lokoja and nearby areas (Ganaja, Adankolo, Felele, Kabba Road). Motorbike dispatch.\n\n₦1,500 per trip within Lokoja. Extra charge for longer distances. Available 8am–8pm daily. Contact me on WhatsApp — quick response guaranteed!',
        category: 'SERVICES',
        price: 1500,
        listingType: 'SERVICE',
        images: [unsplash('1568605117036-5fe5e7bab0b7'), unsplash('1580910051074-3eb694886505')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 95,
      },
      {
        sellerId: U,
        title: 'Graphic Design & Printing Services',
        description: 'Professional graphic design for flyers, banners, logos, and social media posts. Also offering printing services (flex banners, ID cards, T-shirts, mugs).\n\nStarting at ₦3,500/design. Turnaround: 24–48 hours. Send your brief via WhatsApp. Sample works available on request.',
        category: 'SERVICES',
        price: 3500,
        listingType: 'SERVICE',
        images: [unsplash('1626785774573-4b799315a0d8'), unsplash('1547658719-da2b51169166')],
        location: 'Lokoja, Kogi State',
        servingState: 'Kogi State',
        viewCount: 119,
      },
    ];

    // Create all listings in batches of 10
    let seeded = 0;
    for (const listing of listings) {
      await prisma.marketplaceListing.create({ data: listing as Parameters<typeof prisma.marketplaceListing.create>[0]['data'] });
      seeded++;
    }
    console.info(`✅ ${seeded} marketplace listings seeded`);
  }

  // ── Original Demo: Marketplace Conversation ───────────────────────────────
  // Keep the original demo conversation between Iniubong and Paschal
  const khakiListing = await prisma.marketplaceListing.findFirst({
    where: { sellerId: corper2.id, title: 'NYSC Khaki Uniform — Size M (Gently Used)' },
  });

  if (khakiListing) {
    const existingComment = await prisma.listingComment.findFirst({
      where: { listingId: khakiListing.id, authorId: corper1.id },
    });
    if (!existingComment) {
      await prisma.listingComment.create({
        data: {
          listingId: khakiListing.id,
          authorId: corper1.id,
          content: "Hi! I'm interested in this. I can offer ₦3,500 — is that negotiable? I'm in Lokoja too so pickup should be easy.",
          bidAmount: 3500,
        },
      });
      await prisma.notification.create({
        data: {
          recipientId: corper2.id,
          actorId: corper1.id,
          type: 'LISTING_COMMENT',
          entityType: 'LISTING',
          entityId: khakiListing.id,
          content: `${corper1.firstName} ${corper1.lastName} commented on your listing: "${khakiListing.title}"`,
        },
      });
      console.info(`✅ Demo bid from ${corper1.firstName} on khaki listing`);
    }

    const existingMktConv = await prisma.marketplaceConversation.findUnique({
      where: { listingId_buyerId: { listingId: khakiListing.id, buyerId: corper1.id } },
    });

    if (!existingMktConv) {
      const conv = await prisma.conversation.create({
        data: {
          type: 'MARKETPLACE',
          participants: {
            create: [{ userId: corper1.id }, { userId: corper2.id }],
          },
        },
      });
      await prisma.marketplaceConversation.create({
        data: {
          conversationId: conv.id,
          listingId: khakiListing.id,
          buyerId: corper1.id,
          sellerId: corper2.id,
        },
      });

      const baseTime = new Date('2026-04-11T14:30:00Z');
      const t = (mins: number) => new Date(baseTime.getTime() + mins * 60 * 1000);

      const messages = [
        { senderId: corper1.id, content: "Hi Paschal! I saw your khaki uniform listing on Mami Market. Is it still available?", createdAt: t(0) },
        { senderId: corper2.id, content: "Yes it is! Still in great condition — worn only twice during CDS. Are you interested?", createdAt: t(3) },
        { senderId: corper1.id, content: "Nice! I left a bid of ₦3,500 in the comments. Is that price something you'd consider?", createdAt: t(5) },
        { senderId: corper2.id, content: "Hmm, ₦3,500 is a bit low for a full set in this condition. Best I can do is ₦4,000 — that's final 😊", createdAt: t(8) },
        { senderId: corper1.id, content: "Okay, deal! ₦4,000 works for me. Where can we meet? I'm around Lokoja.", createdAt: t(10) },
        { senderId: corper2.id, content: "Perfect! Let's meet at the NYSC Secretariat on Thursday by 2pm. Does that work for you?", createdAt: t(13) },
        { senderId: corper1.id, content: "Thursday 2pm works! I'll be there. Please bring the full set — trousers, shirt, and beret.", createdAt: t(15) },
        { senderId: corper2.id, content: "Will do! See you Thursday. Come with the cash ready 😄 It was nice meeting a fellow corper through Mami Market!", createdAt: t(17) },
      ];

      for (const msg of messages) {
        await prisma.message.create({
          data: { conversationId: conv.id, senderId: msg.senderId, content: msg.content, type: 'TEXT', createdAt: msg.createdAt },
        });
      }

      const lastRead = t(17);
      await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: lastRead } });
      await prisma.conversationParticipant.updateMany({ where: { conversationId: conv.id }, data: { lastReadAt: lastRead } });
      await prisma.notification.create({
        data: {
          recipientId: corper2.id,
          actorId: corper1.id,
          type: 'MARKETPLACE_MESSAGE',
          entityType: 'CONVERSATION',
          entityId: conv.id,
          content: `${corper1.firstName} sent you a message about: "${khakiListing.title}"`,
          createdAt: t(0),
        },
      });
      console.info(`✅ Demo marketplace conversation seeded (${messages.length} messages)`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalListings = await prisma.marketplaceListing.count({
    where: { sellerId: { in: [corper1.id, corper2.id] } },
  });

  console.info('\n🎉 Database seeded successfully!');
  console.info('─────────────────────────────────────────────────────────');
  console.info('Admin panel:    admin@corpers-connect.ng / Admin@1234');
  console.info('Official:       admin@corpersconnect.com.ng / Admin@1234');
  console.info('Corper 1:       KG/25C/1358 / Corper@1234  — Iniubong Udofot (Seller + Buyer)');
  console.info('Corper 2:       KG/25C/1359 / Corper@1234  — Paschal Chukwuemerie (Seller)');
  console.info('─────────────────────────────────────────────────────────');
  console.info(`Marketplace:    ${totalListings} total listings seeded across both sellers`);
  console.info('  Udofot\'s Mini Market   → Electronics, food, clothes, shoes, services');
  console.info('  Paschal\'s Corper Store → Electronics, housing, food, uniform, services');
  console.info('─────────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
