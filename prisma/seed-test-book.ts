/**
 * Seeds the first test book: "Blinded by Religion" by The Unbothered (Paschal).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register prisma/seed-test-book.ts [path/to/cover.jpg]
 *
 * If a cover image path is supplied, it uploads to Cloudinary.
 * Otherwise it uses a dark placeholder.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { cloudinary } from '../src/config/cloudinary';

const prisma = new PrismaClient();

async function uploadToCloudinary(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      { folder, resource_type: 'image', quality: 'auto', width: 800, crop: 'limit' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve(result.secure_url);
      },
    );
  });
}

async function uploadRaw(filePath: string, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      { folder, resource_type: 'raw' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve(result.secure_url);
      },
    );
  });
}

async function main() {
  console.info('📖 Seeding test book: "Blinded by Religion"...\n');

  // Find Paschal
  const paschal = await prisma.user.findUnique({ where: { stateCode: 'KG/25C/1359' } });
  if (!paschal) {
    console.error('❌ Paschal (KG/25C/1359) not found. Run the main seed first.');
    process.exit(1);
  }
  console.info(`✅ Author: ${paschal.firstName} ${paschal.lastName} (${paschal.id})`);

  // Check if book already exists — if so, update the cover if a file was provided
  const existing = await prisma.book.findFirst({
    where: { authorId: paschal.id, title: 'Blinded by Religion' },
  });
  if (existing && process.argv[2] && fs.existsSync(process.argv[2])) {
    console.info(`📤 Book exists — uploading new cover from: ${process.argv[2]}`);
    const newCover = await uploadToCloudinary(path.resolve(process.argv[2]), 'corpers-connect/books/covers');
    await prisma.book.update({ where: { id: existing.id }, data: { coverImageUrl: newCover } });
    console.info(`✅ Cover updated: ${newCover}`);
    return;
  }
  if (existing) {
    console.info('✅ Book already exists — skipping (pass a cover image path to update cover)');
    return;
  }

  // Cover image: try to upload from file, fall back to placeholder
  const coverArg = process.argv[2];
  let coverImageUrl: string;

  if (coverArg && fs.existsSync(coverArg)) {
    console.info(`📤 Uploading cover from: ${coverArg}`);
    coverImageUrl = await uploadToCloudinary(path.resolve(coverArg), 'corpers-connect/books/covers');
    console.info(`✅ Cover uploaded: ${coverImageUrl}`);
  } else {
    // Use an Unsplash dark/dramatic image as temporary placeholder
    coverImageUrl = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&q=80&fit=crop';
    console.info('⚠️  No cover file provided — using placeholder image.');
    console.info('   To use the real cover, re-run with:');
    console.info('   npx ts-node -r tsconfig-paths/register prisma/seed-test-book.ts path/to/cover.jpg\n');
  }

  // Create a minimal placeholder PDF (we don't have the real book PDF)
  const pdfUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/sample.pdf';

  const book = await prisma.book.create({
    data: {
      authorId: paschal.id,
      title: 'Blinded by Religion',
      subtitle: 'Finding God Beyond the Veil',
      description: [
        'This book is for the wounded.',
        '',
        'For those who have been hurt by the very people who claimed to speak for God.',
        '',
        'For those who whispered their doubts in the dark… afraid one honest question might shatter their faith.',
        '',
        'Blinded by Religion confronts the empty traditions, the celebrity pastors, and the sugar-coated gospel that sells comfort instead of the Cross.',
        '',
        'But this is not a book of cynicism.',
        '',
        '"Blinded by Religion exposes the empty traditions, the celebrity pastors, the tribal walls, and the sugar-coated gospel that sells comfort instead of the Cross."',
      ].join('\n'),
      aboutTheAuthor: [
        'The Unbothered is a writer, artist, and follower of Jesus who believes that honest questions are the birthplace of deeper faith.',
        '',
        'Born and raised in Anambra, Nigeria, The Unbothered grew up within the walls of religion before learning to see beyond them — a journey through doubt, performance, and ultimately the liberating presence of a God who refuses to fit inside human boxes.',
        '',
        'theunbotheredbooks',
      ].join('\n'),
      coverImageUrl,
      pdfUrl,
      genre: 'RELIGIOUS',
      tags: ['faith', 'religion', 'christianity', 'doubt', 'spirituality'],
      language: 'English',
      priceKobo: 200000, // ₦2,000
      previewPages: 15,
      status: 'PUBLISHED',
      totalSales: 7,
      avgRating: 4.5,
      reviewCount: 3,
      publishedAt: new Date('2026-04-10T08:00:00Z'),
    },
  });

  console.info(`✅ Book created: "${book.title}" (${book.id})`);
  console.info(`   Price: ₦${book.priceKobo / 100}`);
  console.info(`   Genre: ${book.genre}`);
  console.info(`   Cover: ${book.coverImageUrl}`);

  // Seed a few demo reviews
  const udofot = await prisma.user.findUnique({ where: { stateCode: 'KG/25C/1358' } });

  if (udofot) {
    // Fake purchase so review is allowed + book shows as "owned" for Udofot
    await prisma.bookPurchase.upsert({
      where: { userId_bookId: { userId: udofot.id, bookId: book.id } },
      create: {
        userId: udofot.id,
        bookId: book.id,
        amountKobo: 200000,
        platformFeeKobo: 30000,
        authorPayoutKobo: 170000,
        paystackRef: `bk-demo-${Date.now()}`,
      },
      update: {},
    });

    await prisma.bookReview.upsert({
      where: { userId_bookId: { userId: udofot.id, bookId: book.id } },
      create: {
        userId: udofot.id,
        bookId: book.id,
        rating: 5,
        content: 'This book hit home for me. As a corper who grew up in the church, every page felt like it was written for people like us — questioning but still believing. Must read.',
      },
      update: {},
    });

    console.info(`✅ Demo purchase + review from ${udofot.firstName}`);
  }

  console.info('\n🎉 Test book seeded successfully!');
  console.info('─────────────────────────────────────────');
  console.info(`   Title:    ${book.title}`);
  console.info(`   Subtitle: ${book.subtitle}`);
  console.info(`   Author:   ${paschal.firstName} ${paschal.lastName} (as "The Unbothered")`);
  console.info(`   Price:    ₦${book.priceKobo / 100}`);
  console.info(`   Genre:    ${book.genre}`);
  console.info('─────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
