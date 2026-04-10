import { z } from 'zod';

export const applySellerSchema = z.object({
  businessName: z.string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name cannot exceed 100 characters'),
  businessDescription: z.string()
    .min(10, 'Business description is too short — please write at least 10 characters')
    .max(1000, 'Business description cannot exceed 1000 characters'),
  whatTheySell: z.string()
    .min(3, 'Please describe what you sell (at least 3 characters)')
    .max(200, 'This field cannot exceed 200 characters'),
});

export const createListingSchema = z.object({
  title: z.string()
    .min(3, 'Title is too short — please enter at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters'),
  description: z.string()
    .min(10, 'Description is too short — please write at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  category: z
    .enum(['HOUSING', 'UNIFORM', 'ELECTRONICS', 'FOOD', 'SERVICES', 'OPPORTUNITIES', 'OTHERS'])
    .default('OTHERS'),
  price: z.coerce.number().positive('Price must be a positive number').optional(),
  listingType: z.enum(['FOR_SALE', 'FOR_RENT', 'SERVICE', 'FREE']).default('FOR_SALE'),
  location: z.string().max(200, 'Location cannot exceed 200 characters').optional(),
});

export const updateListingSchema = z.object({
  title: z.string()
    .min(3, 'Title is too short — please enter at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters')
    .optional(),
  description: z.string()
    .min(10, 'Description is too short — please write at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional(),
  category: z
    .enum(['HOUSING', 'UNIFORM', 'ELECTRONICS', 'FOOD', 'SERVICES', 'OPPORTUNITIES', 'OTHERS'])
    .optional(),
  price: z.coerce.number().positive('Price must be a positive number').optional(),
  listingType: z.enum(['FOR_SALE', 'FOR_RENT', 'SERVICE', 'FREE']).optional(),
  location: z.string().max(200, 'Location cannot exceed 200 characters').optional(),
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

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const listReviewsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createListingCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  bidAmount: z.coerce.number().positive().optional(),
  parentId: z.string().optional(),
});

export const updateListingCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  bidAmount: z.coerce.number().positive().optional(),
});

export const listListingCommentsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ApplySellerDto = z.infer<typeof applySellerSchema>;
export type CreateListingDto = z.infer<typeof createListingSchema>;
export type UpdateListingDto = z.infer<typeof updateListingSchema>;
export type ListListingsDto = z.infer<typeof listListingsSchema>;
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
export type ListReviewsDto = z.infer<typeof listReviewsSchema>;
export type CreateListingCommentDto = z.infer<typeof createListingCommentSchema>;
export type UpdateListingCommentDto = z.infer<typeof updateListingCommentSchema>;
export type ListListingCommentsDto = z.infer<typeof listListingCommentsSchema>;
