import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── User Management ───────────────────────────────────────────────────────────

export const listUsersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  servingState: z.string().optional(),
  level: z.enum(['OTONDO', 'KOPA', 'CORPER']).optional(),
  subscriptionTier: z.enum(['FREE', 'PREMIUM']).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  isVerified: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});

export const grantSubscriptionSchema = z.object({
  plan: z.enum(['MONTHLY', 'ANNUAL']),
});

export const suspendUserSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

// ── Reports ───────────────────────────────────────────────────────────────────

export const listReportsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED']).optional(),
  entityType: z.enum(['POST', 'STORY', 'REEL', 'LISTING', 'USER', 'COMMENT']).optional(),
});

export const reviewReportSchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED', 'DISMISSED']),
  reviewNote: z.string().max(1000).optional(),
});

// ── Seller Applications ───────────────────────────────────────────────────────

export const listSellerApplicationsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export const reviewSellerApplicationSchema = z.object({
  reviewNote: z.string().max(500).optional(),
});

// ── System Settings ───────────────────────────────────────────────────────────

export const upsertSettingSchema = z.object({
  value: z.unknown().refine((v) => v !== undefined, { message: 'value is required' }),
});

// ── Admin Management (SUPERADMIN only) ───────────────────────────────────────

export const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'SUPERADMIN']).default('ADMIN'),
});

// ── Seller Management ────────────────────────────────────────────────────────

export const deactivateSellerSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const respondToAppealSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  adminResponse: z.string().min(1).max(1000),
});

export const listSellersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().optional(),
});

export const updateAdminProfileSchema = z.object({
  firstName:  z.string().min(1).max(60).optional(),
  lastName:   z.string().min(1).max(60).optional(),
  department: z.string().min(1).max(100).optional(),
  bio:        z.string().max(500).optional(),
});

export const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required').max(100),
});

export const sendAppealMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminLoginDto = z.infer<typeof adminLoginSchema>;
export type ListUsersDto = z.infer<typeof listUsersSchema>;
export type GrantSubscriptionDto = z.infer<typeof grantSubscriptionSchema>;
export type SuspendUserDto = z.infer<typeof suspendUserSchema>;
export type ListReportsDto = z.infer<typeof listReportsSchema>;
export type ReviewReportDto = z.infer<typeof reviewReportSchema>;
export type ListSellerApplicationsDto = z.infer<typeof listSellerApplicationsSchema>;
export type ReviewSellerApplicationDto = z.infer<typeof reviewSellerApplicationSchema>;
export type UpsertSettingDto = z.infer<typeof upsertSettingSchema>;
export type CreateAdminDto = z.infer<typeof createAdminSchema>;
export type DeactivateSellerDto = z.infer<typeof deactivateSellerSchema>;
export type RespondToAppealDto = z.infer<typeof respondToAppealSchema>;
export type ListSellersDto = z.infer<typeof listSellersSchema>;
export type UpdateAdminProfileDto = z.infer<typeof updateAdminProfileSchema>;
export type SendAppealMessageDto = z.infer<typeof sendAppealMessageSchema>;
export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
