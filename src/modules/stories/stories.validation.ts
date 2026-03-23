import { z } from 'zod';

export const createStorySchema = z.object({
  caption: z.string().max(300).optional(),
});

export const addHighlightSchema = z.object({
  title: z.string().max(50).optional(),
});
