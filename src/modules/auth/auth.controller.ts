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
const SESSION_FLAG_COOKIE = 'cc_session';
// 1 year in ms — sessions never expire under normal use; token rotation keeps
// them alive on every visit. Only an explicit logout clears the session.
const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function getIsProd(): boolean {
  // Detect production by CLIENT_URL, not NODE_ENV — Railway does NOT auto-set
  // NODE_ENV=production, so relying on it caused SameSite=Lax cookies in prod,
  // which browsers block on cross-origin POST requests (frontend ≠ backend domain).
  return !env.CLIENT_URL.includes('localhost');
}

function refreshCookieOptions(): CookieOptions {
  const isProd = getIsProd();
  return {
    httpOnly: true,
    secure: isProd,
    // All API calls now go through the Next.js /api/proxy/* reverse-proxy, so
    // the browser sees these cookies as same-origin.  SameSite=Lax is enough
    // in production (SameSite=None was only needed for direct cross-origin
    // requests, which we no longer make).
    sameSite: isProd ? 'none' : 'lax',
    // Path must be '/' — the proxy rewrites the URL from
    // /api/proxy/api/v1/auth/refresh → /api/v1/auth/refresh on the backend.
    // If we set path=/api/v1/auth/refresh, the browser stores the cookie under
    // that path but the request the browser sees is /api/proxy/…, so the path
    // never matches and the cookie is never sent.
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function sessionFlagCookieOptions(): CookieOptions {
  const isProd = getIsProd();
  return {
    // NOT httpOnly — middleware reads it via Next.js Edge runtime, and the
    // client store needs to clear it on logout.  No sensitive data here.
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

/**
 * Extracts the refreshToken from a service result, sets it as an httpOnly
 * cookie, and also sets a visible cc_session flag cookie (server-set so it is
 * immune to iOS ITP's 7-day cap on JS-set cookies). Returns the rest of the
 * data (without the token) for the JSON response body.
 */
function setRefreshCookie(
  res: Response,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof data.refreshToken === 'string') {
    res.cookie(REFRESH_COOKIE, data.refreshToken, refreshCookieOptions());
    // Set session flag — lets Next.js middleware know the user is authenticated
    // without exposing any secret. Server-set means iOS ITP won't cap it at 7 days.
    res.cookie(SESSION_FLAG_COOKIE, '1', sessionFlagCookieOptions());
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
      const ua = req.headers['user-agent'] || undefined;
      const ip = req.ip || req.socket.remoteAddress || undefined;
      const data = await authService.verifyRegistration(stateCode, otp, ua, ip);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendCreated(res, safe, data.message);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { identifier, password } = loginSchema.parse(req.body);
      const ua = req.headers['user-agent'] || undefined;
      const ip = req.ip || req.socket.remoteAddress || undefined;
      const data = await authService.login(identifier, password, ua, ip);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendSuccess(res, safe, 'Login successful');
    } catch (err) {
      next(err);
    }
  },

  async twoFAChallenge(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, code } = twoFAChallengeSchema.parse(req.body);
      const ua = req.headers['user-agent'] || undefined;
      const ip = req.ip || req.socket.remoteAddress || undefined;
      const data = await authService.complete2FAChallenge(userId, code, ua, ip);
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
      const ua = req.headers['user-agent'] || undefined;
      const ip = req.ip || req.socket.remoteAddress || undefined;
      const data = await authService.refreshToken(refreshToken, ua, ip);
      const safe = setRefreshCookie(res, data as Record<string, unknown>);
      sendSuccess(res, safe, 'Token refreshed');
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.user!.id, req.user!.sessionId ?? '', req.user!.jti);
      // Clear both auth cookies
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: 0 });
      res.clearCookie(SESSION_FLAG_COOKIE, { ...sessionFlagCookieOptions(), maxAge: 0 });
      sendSuccess(res, null, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { identifier } = forgotPasswordSchema.parse(req.body);
      const data = await authService.forgotPassword(identifier);
      sendSuccess(res, { otpToken: data.otpToken, maskedEmail: data.maskedEmail }, data.message);
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { otpToken, otp, newPassword } = resetPasswordSchema.parse(req.body);
      const data = await authService.resetPassword(otpToken, otp, newPassword);
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
