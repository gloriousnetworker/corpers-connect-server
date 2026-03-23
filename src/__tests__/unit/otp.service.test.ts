import { otpService } from '../../shared/services/otp.service';

// Mock Redis
const mockStore: Record<string, string> = {};
jest.mock('../../config/redis', () => ({
  redis: { connect: jest.fn(), quit: jest.fn() },
  redisHelpers: {
    get: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      mockStore[key] = value;
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve(1);
    }),
    incr: jest.fn((key: string) => {
      const cur = parseInt(mockStore[key] ?? '0');
      mockStore[key] = String(cur + 1);
      return Promise.resolve(cur + 1);
    }),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn((key: string) => Promise.resolve(mockStore[key] ? 1 : 0)),
  },
}));

describe('OTPService', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  describe('generate', () => {
    it('generates a 6-digit numeric OTP', () => {
      const otp = otpService.generate();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('generates unique OTPs (statistically)', () => {
      const otps = new Set(Array.from({ length: 20 }, () => otpService.generate()));
      expect(otps.size).toBeGreaterThan(15);
    });
  });

  describe('store & verify', () => {
    it('stores and verifies a valid OTP', async () => {
      await otpService.store('test:user@test.com', '123456');
      await expect(otpService.verify('test:user@test.com', '123456')).resolves.not.toThrow();
    });

    it('throws on wrong OTP', async () => {
      await otpService.store('test:user@test.com', '123456');
      await expect(otpService.verify('test:user@test.com', '000000')).rejects.toThrow();
    });

    it('throws when OTP not found', async () => {
      await expect(otpService.verify('test:nonexistent@test.com', '123456')).rejects.toThrow();
    });
  });

  describe('invalidate', () => {
    it('removes OTP so subsequent verify fails', async () => {
      await otpService.store('test:user@test.com', '999999');
      await otpService.invalidate('test:user@test.com');
      await expect(otpService.verify('test:user@test.com', '999999')).rejects.toThrow();
    });
  });
});
