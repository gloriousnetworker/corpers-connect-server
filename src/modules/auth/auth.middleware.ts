import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../../shared/services/jwt.service';
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
