import { z } from 'zod';

export const PLANS = {
  MONTHLY: { label: 'Corper Plus Monthly', amountKobo: 150_000, durationDays: 30 },
  ANNUAL: { label: 'Corper Plus Annual', amountKobo: 1_400_000, durationDays: 365 },
} as const;

export type PlanKey = keyof typeof PLANS;

export const initializeSubscriptionSchema = z.object({
  plan: z.enum(['MONTHLY', 'ANNUAL']),
  callbackUrl: z.string().url().optional(),
});

export const verifyPaymentSchema = z.object({
  reference: z.string().min(1),
});

export type InitializeSubscriptionDto = z.infer<typeof initializeSubscriptionSchema>;
export type VerifyPaymentDto = z.infer<typeof verifyPaymentSchema>;
