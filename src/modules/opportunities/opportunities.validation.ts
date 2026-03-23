import { z } from 'zod';

export const createOpportunitySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  type: z.enum(['JOB', 'INTERNSHIP', 'VOLUNTEER', 'CONTRACT', 'OTHER']),
  location: z.string().min(1).max(200),
  isRemote: z.boolean().default(false),
  salary: z.string().max(100).optional(),
  deadline: z.coerce.date().optional(),
  requirements: z.string().optional(),
  contactEmail: z.string().email().optional(),
  companyName: z.string().min(1).max(200),
  companyWebsite: z.string().url().optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial();

export const listOpportunitiesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['JOB', 'INTERNSHIP', 'VOLUNTEER', 'CONTRACT', 'OTHER']).optional(),
  isRemote: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().optional(),
});

export const applyToOpportunitySchema = z.object({
  coverLetter: z.string().min(10).max(5000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED']),
});

export const listApplicationsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'REVIEWED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED']).optional(),
});

export type CreateOpportunityDto = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityDto = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesDto = z.infer<typeof listOpportunitiesSchema>;
export type ApplyToOpportunityDto = z.infer<typeof applyToOpportunitySchema>;
export type UpdateApplicationStatusDto = z.infer<typeof updateApplicationStatusSchema>;
export type ListApplicationsDto = z.infer<typeof listApplicationsSchema>;
