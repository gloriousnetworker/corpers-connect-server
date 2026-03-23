import { jwtService } from '../../shared/services/jwt.service';

jest.mock('../../config/redis', () => ({
  redis: { connect: jest.fn(), quit: jest.fn() },
  redisHelpers: {
    setex: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(false),
  },
}));

describe('JWTService', () => {
  const payload = { sub: 'user-123', email: 'test@test.com', role: 'USER' as const };

  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies a valid access token', () => {
      const token = jwtService.signAccessToken(payload);
      expect(token).toBeTruthy();

      const decoded = jwtService.verifyAccessToken(token);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe('USER');
    });

    it('throws on tampered token', () => {
      const token = jwtService.signAccessToken(payload);
      expect(() => jwtService.verifyAccessToken(token + 'tampered')).toThrow();
    });

    it('includes jti in token', () => {
      const token = jwtService.signAccessToken(payload);
      const decoded = jwtService.verifyAccessToken(token);
      expect(decoded.jti).toBeTruthy();
    });
  });

  describe('signRefreshToken / verifyRefreshToken', () => {
    it('signs and verifies a refresh token', () => {
      const token = jwtService.signRefreshToken('user-123', 'session-abc');
      const decoded = jwtService.verifyRefreshToken(token);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.sessionId).toBe('session-abc');
    });

    it('throws on tampered refresh token', () => {
      const token = jwtService.signRefreshToken('user-123', 'session-abc');
      expect(() => jwtService.verifyRefreshToken(token + 'x')).toThrow();
    });
  });

  describe('blockToken / isBlocked', () => {
    it('marks token as blocked', async () => {
      const { redisHelpers } = await import('../../config/redis');
      (redisHelpers.exists as jest.Mock).mockResolvedValueOnce(true);

      await jwtService.blockToken('jti-abc', 900);
      const blocked = await jwtService.isBlocked('jti-abc');
      expect(blocked).toBe(true);
    });

    it('returns false for non-blocked token', async () => {
      const { redisHelpers } = await import('../../config/redis');
      (redisHelpers.exists as jest.Mock).mockResolvedValueOnce(false);

      const blocked = await jwtService.isBlocked('jti-fresh');
      expect(blocked).toBe(false);
    });
  });
});
