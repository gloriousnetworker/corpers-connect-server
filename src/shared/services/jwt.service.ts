import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';
import { redisHelpers } from '../../config/redis';
import { UnauthorizedError } from '../utils/errors';

export interface AccessTokenPayload {
  sub: string;   // userId
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  jti: string;   // JWT ID — used for blocklist
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  sessionId: string;
}

const BLOCKLIST_PREFIX = 'jwt:blocklist:';

export const jwtService = {
  signAccessToken(payload: { sub: string; email: string; role: 'USER' | 'ADMIN' | 'SUPERADMIN' }): string {
    const jti = uuidv4();
    return jwt.sign({ ...payload, jti }, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
    });
  },

  signRefreshToken(userId: string, sessionId: string): string {
    const jti = uuidv4();
    return jwt.sign(
      { sub: userId, jti, sessionId } as RefreshTokenPayload,
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions['expiresIn'] },
    );
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  },

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  },

  async blockToken(jti: string, ttlSeconds: number): Promise<void> {
    await redisHelpers.setex(`${BLOCKLIST_PREFIX}${jti}`, ttlSeconds, '1');
  },

  async isBlocked(jti: string): Promise<boolean> {
    try {
      return await redisHelpers.exists(`${BLOCKLIST_PREFIX}${jti}`);
    } catch {
      // Redis unavailable — JWT signature already validated; allow through
      return false;
    }
  },
};
