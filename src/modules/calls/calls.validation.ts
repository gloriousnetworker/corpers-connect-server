import { z } from 'zod';

export const initiateCallSchema = z.object({
  receiverId: z.string().min(1),
  type: z.enum(['VOICE', 'VIDEO']).default('VOICE'),
});

export const updateCallStatusSchema = z.object({
  status: z.enum(['ENDED', 'REJECTED']),
});

export const callHistorySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['VOICE', 'VIDEO']).optional(),
});

export type InitiateCallDto = z.infer<typeof initiateCallSchema>;
export type CallHistoryDto = z.infer<typeof callHistorySchema>;
