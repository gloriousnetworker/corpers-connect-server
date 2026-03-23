import { z } from 'zod';
import { MessageType } from '@prisma/client';

export const createConversationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DM'),
    participantId: z.string().min(1, 'participantId is required'),
  }),
  z.object({
    type: z.literal('GROUP'),
    name: z.string().min(1).max(100),
    description: z.string().max(300).optional(),
    participantIds: z.array(z.string()).min(1, 'At least one other participant required').max(49),
  }),
]);

export const updateConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  picture: z.string().url().optional(),
});

export const updateParticipantSettingsSchema = z.object({
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  mutedUntil: z.string().datetime().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().max(4000).optional(),
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  mediaUrl: z.string().url().optional(),
  replyToId: z.string().optional(),
}).refine((d) => d.content || d.mediaUrl, {
  message: 'Message must have content or mediaUrl',
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const addParticipantsSchema = z.object({
  userIds: z.array(z.string()).min(1).max(20),
});

export type CreateConversationDto = z.infer<typeof createConversationSchema>;
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
