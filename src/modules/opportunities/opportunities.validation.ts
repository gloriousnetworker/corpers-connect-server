import { z } from 'zod';

const opportunityTypeEnum = z.enum([
  'JOB',
  'INTERNSHIP',
  'VOLUNTEER',
  'CONTRACT',
  'GIG',
  'OTHER',
]);

const payModelEnum = z.enum(['FIXED', 'HOURLY', 'DAILY', 'COMMISSION', 'SALARY', 'UNPAID']);

// Skills are short tags. Cap aggressively so we don't end up with paragraphs
// in this field — the description is the place for long-form text.
const skillsArray = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .default([]);

export const createOpportunitySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  type: opportunityTypeEnum,
  location: z.string().min(1).max(200),
  state: z.string().max(80).optional(),
  lga: z.string().max(80).optional(),
  isRemote: z.boolean().default(false),
  salary: z.string().max(100).optional(),
  payModel: payModelEnum.optional(),
  skills: skillsArray.optional(),
  deadline: z.coerce.date().optional(),
  requirements: z.string().optional(),
  contactEmail: z.string().email().optional(),
  companyName: z.string().min(1).max(200),
  companyWebsite: z.string().url().optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial();

// Allow comma-separated skills via query string for GET /opportunities?skills=design,writing
const csvSkills = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

export const listOpportunitiesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: opportunityTypeEnum.optional(),
  isRemote: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().optional(),
  state: z.string().max(80).optional(),
  payModel: payModelEnum.optional(),
  skills: csvSkills,
  // verifiedOnly=true filters the feed to admin-verified opportunities only.
  // Pattern matches isRemote above — undefined when the flag isn't passed,
  // so existing callers / tests don't have to provide it.
  verifiedOnly: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : undefined)),
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

export const reportOpportunitySchema = z.object({
  reason: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
});

// Admin-side moderation. `verified=false` un-verifies (e.g. correcting a mistake).
export const verifyOpportunitySchema = z.object({
  verified: z.boolean(),
});

export type CreateOpportunityDto = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityDto = z.infer<typeof updateOpportunitySchema>;
export type ListOpportunitiesDto = z.infer<typeof listOpportunitiesSchema>;
export type ApplyToOpportunityDto = z.infer<typeof applyToOpportunitySchema>;
export type UpdateApplicationStatusDto = z.infer<typeof updateApplicationStatusSchema>;
export type ListApplicationsDto = z.infer<typeof listApplicationsSchema>;
export type ReportOpportunityDto = z.infer<typeof reportOpportunitySchema>;
export type VerifyOpportunityDto = z.infer<typeof verifyOpportunitySchema>;
