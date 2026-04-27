import { z } from 'zod';

/** Each social-link field is an optional bounded string. Unknown keys are ignored. */
const socialLinksSchema = z
  .object({
    instagram: z.string().max(200).optional(),
    twitter:   z.string().max(200).optional(),
    facebook:  z.string().max(200).optional(),
    whatsapp:  z.string().max(50).optional(),
    linkedin:  z.string().max(200).optional(),
    youtube:   z.string().max(200).optional(),
    tiktok:    z.string().max(200).optional(),
    website:   z.string().max(500).optional(),
  })
  .nullable()
  .optional();

export const updateMeSchema = z.object({
  bio: z.string().max(160, 'Bio must be 160 characters or less').optional(),
  corperTag: z.boolean().optional(),
  corperTagLabel: z.string().max(30, 'Tag label must be 30 characters or less').nullable().optional(),
  socialLinks: socialLinksSchema,
  cvUrl: z.string().url('CV URL must be a valid URL').nullable().optional(),
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

export const changeEmailInitiateSchema = z.object({
  newEmail: z.string().email('Please provide a valid email address').toLowerCase(),
  currentPassword: z.string().min(1, 'Current password is required'),
});

export const changeEmailVerifySchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

export const requestCorperUpgradeSchema = z.object({
  // NYSC state codes look like: AB/24A/1234.
  stateCode: z
    .string()
    .min(1, 'State code is required')
    .regex(/^[A-Z]{2}\/\d{2}[A-C]\/\d{3,5}$/i, 'Invalid format. Use the full code, e.g. LA/24A/1234'),
});

export type UpdateMeDto = z.infer<typeof updateMeSchema>;
export type OnboardDto = z.infer<typeof onboardSchema>;
export type ChangeEmailInitiateDto = z.infer<typeof changeEmailInitiateSchema>;
export type ChangeEmailVerifyDto = z.infer<typeof changeEmailVerifySchema>;
export type RequestCorperUpgradeDto = z.infer<typeof requestCorperUpgradeSchema>;
