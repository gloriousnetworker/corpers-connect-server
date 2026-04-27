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

// ── Marketer (NIN-verified) registration ─────────────────────────────────────

export const marketerRegisterInitiateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Phone must be 10-15 digits, optionally starting with +'),
  // Nigerian NIN is exactly 11 digits.
  nin: z.string().trim().regex(/^\d{11}$/, 'NIN must be exactly 11 digits'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const marketerRegisterVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});
