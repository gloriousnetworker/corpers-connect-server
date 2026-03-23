import { z } from 'zod';

export const updateMeSchema = z.object({
  bio: z.string().max(160, 'Bio must be 160 characters or less').optional(),
  corperTag: z.boolean().optional(),
  corperTagLabel: z.string().max(30, 'Tag label must be 30 characters or less').nullable().optional(),
});

export const onboardSchema = z.object({
  bio: z.string().max(160).optional(),
  corperTag: z.boolean().optional(),
  corperTagLabel: z.string().max(30).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .default('20')
    .transform(Number)
    .refine((n) => n > 0 && n <= 100, 'Limit must be 1–100'),
});

export const searchSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(100),
  cursor: z.string().optional(),
  limit: z
    .string()
    .default('20')
    .transform(Number)
    .refine((n) => n > 0 && n <= 100, 'Limit must be 1–100'),
});

export type UpdateMeDto = z.infer<typeof updateMeSchema>;
export type OnboardDto = z.infer<typeof onboardSchema>;
