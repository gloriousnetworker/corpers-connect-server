import { z } from 'zod';

const moodValues = ['HAPPY', 'TIRED', 'EXCITED', 'HOMESICK', 'GRATEFUL', 'FUNNY', 'PROUD', 'STRESSED', 'BORED', 'INSPIRED'] as const;
const visibilityValues = ['PRIVATE', 'FRIENDS', 'PUBLIC'] as const;

export const upsertCampDaySchema = z.object({
  dayNumber: z.number().int().min(1).max(21),
  title: z.string().max(140).optional(),
  story: z.string().max(5000).optional(),
  mood: z.enum(moodValues).optional(),
  mediaUrls: z.array(z.string()).max(10).optional().default([]),
  taggedUserIds: z.array(z.string()).max(20).optional().default([]),
  isHighlight: z.boolean().optional().default(false),
  visibility: z.enum(visibilityValues).optional().default('FRIENDS'),
  campName: z.string().max(100).optional(),
  campState: z.string().max(100).optional(),
  entryDate: z.string().optional(),
});

export type UpsertCampDayDto = z.infer<typeof upsertCampDaySchema>;
