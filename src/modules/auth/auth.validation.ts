import { z } from 'zod';

export const lookupSchema = z.object({
  stateCode: z.string().min(1, 'State code is required'),
});

export const registerInitiateSchema = z.object({
  stateCode: z.string().min(1, 'State code is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const registerVerifySchema = z.object({
  stateCode: z.string().min(1, 'State code is required'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or state code is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Email or state code is required'),
});

export const resetPasswordSchema = z.object({
  otpToken: z.string().min(1, 'Token is required'),
  otp: z.string().length(6).regex(/^\d+$/),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const enable2FAVerifySchema = z.object({
  code: z.string().min(6).max(8),
});

export const disable2FASchema = z.object({
  code: z.string().min(6).max(8),
});

export const twoFAChallengeSchema = z.object({
  userId: z.string().min(1),
  code: z.string().min(6).max(8),
});
