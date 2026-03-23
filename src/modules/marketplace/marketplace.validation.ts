import { z } from 'zod';

export const applySellerSchema = z.object({
  // idDoc uploaded as multipart file — no body fields required beyond the file
});

export const createListingSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: z
    .enum(['HOUSING', 'UNIFORM', 'ELECTRONICS', 'FOOD', 'SERVICES', 'OPPORTUNITIES', 'OTHERS'])
    .default('OTHERS'),
  price: z.coerce.number().positive().optional(),
  listingType: z.enum(['FOR_SALE', 'FOR_RENT', 'SERVICE', 'FREE']).default('FOR_SALE'),
  location: z.string().max(200).optional(),
});

export const updateListingSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(2000).optional(),
  category: z
    .enum(['HOUSING', 'UNIFORM', 'ELECTRONICS', 'FOOD', 'SERVICES', 'OPPORTUNITIES', 'OTHERS'])
    .optional(),
  price: z.coerce.number().positive().optional(),
  listingType: z.enum(['FOR_SALE', 'FOR_RENT', 'SERVICE', 'FREE']).optional(),
  location: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'SOLD', 'INACTIVE']).optional(),
});

export const listListingsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z
    .enum(['HOUSING', 'UNIFORM', 'ELECTRONICS', 'FOOD', 'SERVICES', 'OPPORTUNITIES', 'OTHERS'])
    .optional(),
  listingType: z.enum(['FOR_SALE', 'FOR_RENT', 'SERVICE', 'FREE']).optional(),
  state: z.string().optional(),
  search: z.string().max(100).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
});

export type CreateListingDto = z.infer<typeof createListingSchema>;
export type UpdateListingDto = z.infer<typeof updateListingSchema>;
export type ListListingsDto = z.infer<typeof listListingsSchema>;
