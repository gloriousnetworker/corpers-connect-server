import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { jwtService } from '../../shared/services/jwt.service';
import { otpService } from '../../shared/services/otp.service';
import { addEmailJob } from '../../jobs';
import { emailService } from '../../shared/services/email.service';
import { nyscService } from '../nysc/nysc.service';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../shared/utils/errors';

export const authService = {
  // ── NYSC Lookup ─────────────────────────────────────────────────────────────
  async lookupStateCode(stateCode: string) {
    const corper = await nyscService.getCorperByStateCode(stateCode);

    // Check if already registered
    const existing = await prisma.user.findUnique({
      where: { stateCode: stateCode.toUpperCase().trim() },
    });

    return {
      ...corper,
      alreadyRegistered: !!existing,
    };
  },

  // ── Registration: Initiate ───────────────────────────────────────────────────
  async initiateRegistration(stateCode: string, password: string) {
    const normalised = stateCode.toUpperCase().trim();

    // Check already registered
    const existing = await prisma.user.findUnique({ where: { stateCode: normalised } });
    if (existing) {
      throw new ConflictError(
        'An account with this state code already exists. Please login instead.',
      );
    }

    // Fetch NYSC record (validates format + existence)
    const corper = await nyscService.getCorperByStateCode(normalised);

    // Hash password and store temporarily in Redis (10 min TTL)
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
    const pendingKey = `pending_registration:${normalised}`;
    const { redisHelpers } = await import('../../config/redis');
    await redisHelpers.setex(
      pendingKey,
      600,
      JSON.stringify({ passwordHash, corper }),
    );

    // Send OTP directly — bypasses BullMQ to avoid Railway IPv6/worker issues.
    // Matches the proven pattern used in cbt-simulator-backend.
    const otp = otpService.generate();
    await otpService.store(`reg:${corper.email}`, otp);
    await emailService.sendOTP(corper.email, corper.firstName, otp, 'registration');

    return {
      email: corper.email,
      maskedEmail: maskEmail(corper.email),
      message: `Verification code sent to ${maskEmail(corper.email)}`,
      // Only expose raw OTP in test env so integration tests can verify the flow
      ...(env.NODE_ENV === 'test' && { devOtp: otp }),
    };
  },

  // ── Registration: Verify OTP & Create Account ────────────────────────────────
  async verifyRegistration(stateCode: string, otp: string) {
    const normalised = stateCode.toUpperCase().trim();
    const { redisHelpers } = await import('../../config/redis');

    const pendingKey = `pending_registration:${normalised}`;
    const pending = await redisHelpers.get(pendingKey);
    if (!pending) {
      throw new BadRequestError(
        'Registration session expired. Please start registration again.',
      );
    }

    const { passwordHash, corper } = JSON.parse(pending);

    // Verify OTP
    await otpService.verify(`reg:${corper.email}`, otp);

    // Create user
    const user = await prisma.user.create({
      data: {
        stateCode: normalised,
        firstName: corper.firstName,
        lastName: corper.lastName,
        email: corper.email,
        phone: corper.phone,
        passwordHash,
        servingState: corper.servingState,
        lga: corper.lga,
        ppa: corper.ppa,
        batch: corper.batch,
      },
    });

    // Clean up Redis
    await redisHelpers.del(pendingKey);

    // Issue tokens
    const tokens = await createSession(user.id, user.email, 'USER');

    return {
      user: sanitiseUser(user),
      ...tokens,
      message: 'Account created successfully. Welcome to Corpers Connect!',
    };
  },

  // ── Login ────────────────────────────────────────────────────────────────────
  async login(identifier: string, password: string) {
    // Find by email or state code
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase().trim() },
          { stateCode: identifier.toUpperCase().trim() },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenError(
        'Your account has been suspended. Please contact support.',
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // If 2FA enabled, return partial response — client must complete 2FA challenge
    if (user.twoFactorEnabled) {
      const challengeToken = uuidv4();
      const { redisHelpers } = await import('../../config/redis');
      await redisHelpers.setex(`2fa_challenge:${challengeToken}`, 300, user.id);

      return {
        requires2FA: true,
        challengeToken,
        message: 'Please complete 2FA verification',
      };
    }

    const tokens = await createSession(user.id, user.email, 'USER', identifier);

    return {
      requires2FA: false,
      user: sanitiseUser(user),
      ...tokens,
    };
  },

  // ── 2FA Challenge (login step 2) ─────────────────────────────────────────────
  async complete2FAChallenge(challengeToken: string, code: string) {
    const { redisHelpers, redis } = await import('../../config/redis');

    const attemptsKey = `2fa_attempts:${challengeToken}`;
    const MAX_ATTEMPTS = 5;

    const userId = await redisHelpers.get(`2fa_challenge:${challengeToken}`);
    if (!userId) {
      throw new BadRequestError('2FA challenge expired. Please login again.');
    }

    // Brute-force guard: track failed attempts against this challenge token.
    // After MAX_ATTEMPTS failures the token is deleted, forcing a fresh login.
    const attempts = parseInt((await redisHelpers.get(attemptsKey)) ?? '0', 10);
    if (attempts >= MAX_ATTEMPTS) {
      await redisHelpers.del(`2fa_challenge:${challengeToken}`);
      await redisHelpers.del(attemptsKey);
      throw new BadRequestError('Too many incorrect attempts. Please login again.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) throw new UnauthorizedError('Invalid challenge');

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) {
      // Increment attempt counter with the same TTL as the challenge token (300 s)
      await redis.set(attemptsKey, attempts + 1, 'EX', 300);
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      throw new UnauthorizedError(
        remaining > 0
          ? `Invalid 2FA code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid 2FA code.',
      );
    }

    // Success — clean up both keys
    await redisHelpers.del(`2fa_challenge:${challengeToken}`);
    await redisHelpers.del(attemptsKey);

    const tokens = await createSession(user.id, user.email, 'USER');
    return { user: sanitiseUser(user), ...tokens };
  },

  // ── Refresh Token ────────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string) {
    const payload = jwtService.verifyRefreshToken(refreshToken);

    // Check session still valid
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.refreshToken !== refreshToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedError('Session expired. Please login again.');
    }

    // Rotate: delete old session, create new one
    await prisma.session.delete({ where: { id: session.id } });
    const tokens = await createSession(session.userId, session.user.email, 'USER');

    return tokens;
  },

  // ── Logout ───────────────────────────────────────────────────────────────────
  async logout(userId: string, sessionId: string, accessTokenJti: string) {
    // Block the access token (15 min TTL — matches token expiry)
    await jwtService.blockToken(accessTokenJti, 60 * 15);

    // Delete session
    await prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
  },

  // ── Forgot Password ──────────────────────────────────────────────────────────
  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Always respond the same way to prevent email enumeration
    if (!user) return { message: `If that email is registered, a reset code has been sent.` };

    const otp = otpService.generate();
    await otpService.store(`reset:${email}`, otp);
    await emailService.sendOTP(email, user.firstName, otp, 'forgot-password');

    return {
      message: `Reset code sent to ${maskEmail(email)}`,
      ...(env.NODE_ENV === 'test' && { devOtp: otp }),
    };
  },

  // ── Reset Password ───────────────────────────────────────────────────────────
  async resetPassword(email: string, otp: string, newPassword: string) {
    await otpService.verify(`reset:${email}`, otp);

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
    await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { passwordHash },
    });

    // Invalidate all sessions for security
    await prisma.session.deleteMany({ where: { user: { email } } });

    return { message: 'Password reset successfully. Please login with your new password.' };
  },

  // ── Change Password ──────────────────────────────────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestError('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, isFirstLogin: false },
    });

    return { message: 'Password changed successfully' };
  },

  // ── Enable 2FA ───────────────────────────────────────────────────────────────
  async initiate2FASetup(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    if (user.twoFactorEnabled) throw new ConflictError('2FA is already enabled');

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(user.email, 'Corpers Connect', secret);
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    // Store temp secret in Redis (5 min TTL — user must confirm before it's saved)
    const { redisHelpers } = await import('../../config/redis');
    await redisHelpers.setex(`2fa_setup:${userId}`, 300, secret);

    return { secret, qrCode, message: 'Scan the QR code with your authenticator app' };
  },

  async confirm2FASetup(userId: string, code: string) {
    const { redisHelpers } = await import('../../config/redis');
    const secret = await redisHelpers.get(`2fa_setup:${userId}`);
    if (!secret) throw new BadRequestError('2FA setup expired. Please try again.');

    const valid = authenticator.verify({ token: code, secret });
    if (!valid) throw new BadRequestError('Invalid code. Please try again.');

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    });

    await redisHelpers.del(`2fa_setup:${userId}`);
    return { message: '2FA enabled successfully' };
  },

  async disable2FA(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    if (!user.twoFactorEnabled) throw new BadRequestError('2FA is not enabled');
    if (!user.twoFactorSecret) throw new BadRequestError('2FA setup is incomplete');

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new BadRequestError('Invalid 2FA code');

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: '2FA disabled successfully' };
  },

  // ── Sessions ─────────────────────────────────────────────────────────────────
  async getSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
    });
  },

  async revokeSession(userId: string, sessionId: string) {
    await prisma.session.deleteMany({ where: { id: sessionId, userId } });
    return { message: 'Session revoked' };
  },

  async revokeAllSessions(userId: string, currentSessionId: string) {
    await prisma.session.deleteMany({
      where: { userId, NOT: { id: currentSessionId } },
    });
    return { message: 'All other sessions revoked' };
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function createSession(
  userId: string,
  email: string,
  role: 'USER' | 'ADMIN' | 'SUPERADMIN',
  _deviceInfo?: string,
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: { userId, refreshToken: '', expiresAt },
  });

  const accessToken = jwtService.signAccessToken({ sub: userId, email, role });
  const refreshToken = jwtService.signRefreshToken(userId, session.id);

  // Store actual refresh token
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken },
  });

  return { accessToken, refreshToken, sessionId: session.id };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const masked = local.slice(0, 2) + '***' + local.slice(-1);
  return `${masked}@${domain}`;
}

function sanitiseUser(user: Record<string, unknown>) {
  // Explicitly exclude all sensitive fields — never expose these to clients
  const {
    passwordHash: _passwordHash,
    twoFactorSecret: _twoFactorSecret,
    fcmTokens: _fcmTokens,
    isActive: _isActive,
    ...safe
  } = user as {
    passwordHash: string;
    twoFactorSecret: string | null;
    fcmTokens: string[];
    isActive: boolean;
    [key: string]: unknown;
  };
  return safe;
}
