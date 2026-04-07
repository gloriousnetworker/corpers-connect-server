import { z } from 'zod';

export const submitJoinRequestSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().optional(),
  stateCode: z
    .string()
    .min(1, 'State code is required')
    .regex(
      /^[A-Z]{2}\/\d{2}[A-Z]\d?\/\d{3,5}$/i,
      'Invalid state code format. Expected format: AB/23A/1234',
    ),
  servingState: z.string().min(2, 'Serving state is required'),
  lga: z.string().optional(),
  ppa: z.string().optional(),
  batch: z.string().min(1, 'Batch is required'),
});

export const reviewJoinRequestSchema = z.object({
  reviewNote: z.string().optional(),
});

export type SubmitJoinRequestDto = z.infer<typeof submitJoinRequestSchema>;
export type ReviewJoinRequestDto = z.infer<typeof reviewJoinRequestSchema>;
