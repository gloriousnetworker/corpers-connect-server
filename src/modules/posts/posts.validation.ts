import { z } from 'zod';

export const createPostSchema = z
  .object({
    content: z.string().max(2000, 'Post content must be 2000 characters or less').optional(),
    mediaUrls: z.array(z.string()).max(4, 'Maximum 4 media items per post').optional().default([]),
    visibility: z.enum(['PUBLIC', 'STATE', 'FRIENDS', 'ONLY_ME']).default('PUBLIC'),
    postType: z.enum(['REGULAR', 'REEL', 'OPPORTUNITY']).default('REGULAR'),
  })
  .refine(
    (data) =>
      (data.content && data.content.trim().length > 0) ||
      (data.mediaUrls && data.mediaUrls.length > 0),
    { message: 'Post must have text content or at least one media item' },
  );

export const updatePostSchema = z.object({
  content: z.string().max(2000).optional(),
  visibility: z.enum(['PUBLIC', 'STATE', 'FRIENDS', 'ONLY_ME']).optional(),
});

export const reactSchema = z.object({
  type: z.enum(['LIKE', 'LOVE', 'FIRE', 'CLAP']),
});

export const addCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(1000),
  parentId: z.string().optional(),
});

export const commentReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

export const reportSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(200),
  details: z.string().max(500).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .default('20')
    .transform(Number)
    .refine((n) => n > 0 && n <= 100, 'Limit must be 1–100'),
});

export type CreatePostDto = z.infer<typeof createPostSchema>;
export type UpdatePostDto = z.infer<typeof updatePostSchema>;
