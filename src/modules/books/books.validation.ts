import { z } from 'zod';

const genres = [
  'FICTION', 'NON_FICTION', 'RELIGIOUS', 'SELF_HELP', 'BUSINESS',
  'BIOGRAPHY', 'POETRY', 'ACADEMIC', 'CHILDREN', 'HEALTH',
  'TECHNOLOGY', 'HISTORY', 'OTHER',
] as const;

const statuses = ['DRAFT', 'PUBLISHED', 'UNLISTED'] as const;

/** Book metadata (sent as JSON alongside the uploaded files) */
export const createBookSchema = z.object({
  title: z.string().min(2).max(200),
  subtitle: z.string().max(200).optional(),
  description: z.string().min(20).max(5000),
  aboutTheAuthor: z.string().max(3000).optional(),
  genre: z.enum(genres).default('OTHER'),
  tags: z.array(z.string().max(30)).max(10).optional().default([]),
  language: z.string().max(50).optional().default('English'),
  priceKobo: z.coerce.number().int().min(0).max(100_000_00), // ₦0–₦100,000
  previewPages: z.coerce.number().int().min(0).max(50).optional().default(10),
  status: z.enum(statuses).optional().default('PUBLISHED'),
});

export const updateBookSchema = createBookSchema.partial();

export const bookListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  genre: z.enum(genres).optional(),
  q: z.string().max(100).optional(),
  authorId: z.string().optional(),
  sort: z.enum(['trending', 'newest', 'bestseller']).optional().default('newest'),
});

export const initiatePurchaseSchema = z.object({
  callbackUrl: z.string().url().optional(),
});

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().max(2000).optional(),
});

export const updateProgressSchema = z.object({
  lastPage: z.coerce.number().int().min(1),
});

export const addHighlightSchema = z.object({
  highlight: z.string().min(1).max(1000),
});

export type CreateBookDto = z.infer<typeof createBookSchema>;
export type UpdateBookDto = z.infer<typeof updateBookSchema>;
export type BookListDto = z.infer<typeof bookListSchema>;
export type InitiatePurchaseDto = z.infer<typeof initiatePurchaseSchema>;
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
export type UpdateProgressDto = z.infer<typeof updateProgressSchema>;
