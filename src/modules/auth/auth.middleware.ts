import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../../shared/services/jwt.service';
import { prisma } from '../../config/prisma';
import { UnauthorizedError, ForbiddenError } from '../../shared/utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: 'USER' | 'ADMIN' | 'SUPERADMIN';
        jti: string;
        sessionId?: string;
      };
      rawBody?: Buffer;
      id: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const payload = jwtService.verifyAccessToken(token);

    // Check if token has been revoked (blocklist)
    const isBlocked = await jwtService.isBlocked(payload.jti);
    if (isBlocked) {
      throw new UnauthorizedError('Token has been revoked');
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
    };

    next();
  } catch (err) {
    next(err);
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
};

export const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== 'SUPERADMIN') {
    return next(new ForbiddenError('Superadmin access required'));
  }
  next();
};

/**
 * Persona guard: rejects requests from MARKETER accounts. Use on routes that
 * are corper-only (post creation, reels, stories, comments, reactions, etc.).
 * Reads accountType from the DB rather than the JWT so a future upgrade from
 * MARKETER → CORPER takes effect on the user's next request, not next login.
 */
export const requireCorper = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { accountType: true },
    });
    if (!user) throw new UnauthorizedError();
    if (user.accountType !== 'CORPER') {
      throw new ForbiddenError(
        'This action is only available to Corper accounts. Marketers can later request a Corper upgrade.',
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Marketplace listing guard: allows CORPER accounts and APPROVED marketers.
 * PENDING/REJECTED marketers are blocked with an actionable message.
 * Use on routes that create/edit marketplace listings.
 */
export const requireMarketerApprovedOrCorper = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { accountType: true, marketerStatus: true },
    });
    if (!user) throw new UnauthorizedError();
    if (user.accountType === 'CORPER') return next();
    if (user.marketerStatus === 'APPROVED') return next();
    if (user.marketerStatus === 'PENDING') {
      throw new ForbiddenError("Your Marketer account is pending verification — you can list once we've approved your NIN.");
    }
    if (user.marketerStatus === 'REJECTED') {
      throw new ForbiddenError('Your Marketer application was rejected. Please contact support.');
    }
    throw new ForbiddenError('Account is not authorised for this action.');
  } catch (err) {
    next(err);
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const payload = jwtService.verifyAccessToken(token);
    const isBlocked = await jwtService.isBlocked(payload.jti);
    if (!isBlocked) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role, jti: payload.jti };
    }
    next();
  } catch {
    next(); // Ignore auth errors for optional routes
  }
};
