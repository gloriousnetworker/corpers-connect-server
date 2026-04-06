import { Request, Response, NextFunction, CookieOptions } from 'express';
import { authService } from './auth.service';
import { sendSuccess, sendCreated } from '../../shared/utils/apiResponse';
import { env } from '../../config/env';
import {
  lookupSchema,
  registerInitiateSchema,
  registerVerifySchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  enable2FAVerifySchema,
  disable2FASchema,
  twoFAChallengeSchema,
} from './auth.validation';

// ── Refresh token cookie helpers ───────────────────────────────────────────────

const REFRESH_COOKIE = 'cc_refresh_token';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    // Restrict to the refresh endpoint so the cookie is never sent on other requests.
    path: '/api/v1/auth/refresh',
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in ms
  };
}

/**
 * Extracts the refreshToken from a service result, sets it as an httpOnly
 * cookie, and returns the rest of the data (without the token) for the
 * JSON response body.
 */
function setRefreshCookie(
  res: Response,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof data.refreshToken === 'string') {
    res.cookie(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());
    const { refreshToken: _rt, ...rest } = data;
    return rest;
  }
  return data;
}

export const authController = {
  async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      const { stateCode } = lookupSchema.parse(req.body);
      const data = await authService.lookupStateCode(stateCode);
      sendSuccess(res, data, 'Corper details retrieved successfully');
    } catch (err) {
      next(err);
    }
  },

  async registerInitiate(req: Request, res: Response, next: NextFunction) {
    try {
      const { stateCode, password } = registerInitiateSchema.parse(req.body);
      const data = await authService.initiateRegistration(stateCode, password);
      sendSuccess(res, data, data.message);
    } catch (err) {
      next(err);
    }
  },

  async registerVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const { stateCode, otp } = registerVerifySchema.parse(req.body);
      const data = await authService.verifyRegistration(stateCode, otp);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendCreated(res, safe, data.message);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { identifier, password } = loginSchema.parse(req.body);
      const data = await authService.login(identifier, password);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendSuccess(res, safe, 'Login successful');
    } catch (err) {
      next(err);
    }
  },

  async twoFAChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, code } = twoFAChallengeSchema.parse(req.body);
      const data = await authService.complete2FAChallenge(userId, code);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendSuccess(res, safe, 'Login successful');
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies[REFRESH_COOKIE] as string | undefined;
      if (!refreshToken) {
        res.status(401).json({ success: false, message: 'No refresh token' });
        return;
      }
      const data = await authService.refreshToken(refreshToken);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendSuccess(res, safe, 'Token refreshed');
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.user!.id, req.user!.sessionId ?? '', req.user!.jti);
      // Clear the refresh token cookie
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: 0 });
      sendSuccess(res, null, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const data = await authService.forgotPassword(email);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);
      const data = await authService.resetPassword(email, otp, newPassword);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const data = await authService.changePassword(req.user!.id, currentPassword, newPassword);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async initiate2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.initiate2FASetup(req.user!.id);
      sendSuccess(res, data, data.message);
    } catch (err) {
      next(err);
    }
  },

  async confirm2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = enable2FAVerifySchema.parse(req.body);
      const data = await authService.confirm2FASetup(req.user!.id, code);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async disable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = disable2FASchema.parse(req.body);
      const data = await authService.disable2FA(req.user!.id, code);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.getSessions(req.user!.id);
      sendSuccess(res, data, 'Sessions retrieved');
    } catch (err) {
      next(err);
    }
  },

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = Array.isArray(req.params.sessionId)
        ? req.params.sessionId[0]
        : req.params.sessionId;
      const data = await authService.revokeSession(req.user!.id, sessionId);
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },

  async revokeAllSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.revokeAllSessions(
        req.user!.id,
        req.user!.sessionId ?? '',
      );
      sendSuccess(res, null, data.message);
    } catch (err) {
      next(err);
    }
  },
};
