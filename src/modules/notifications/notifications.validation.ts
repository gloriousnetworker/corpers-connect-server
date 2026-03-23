import { z } from 'zod';

export const markReadSchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1),
});

export const listNotificationsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type MarkReadDto = z.infer<typeof markReadSchema>;
export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>;
