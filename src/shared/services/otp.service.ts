import { redisHelpers } from '../../config/redis';
import { BadRequestError } from '../utils/errors';

const OTP_TTL_SECONDS = 60 * 10;   // 10 minutes
const MAX_ATTEMPTS = 3;
const OTP_PREFIX = 'otp:';
const OTP_ATTEMPTS_PREFIX = 'otp:attempts:';

export const otpService = {
  generate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  async store(identifier: string, otp: string): Promise<void> {
    const key = `${OTP_PREFIX}${identifier}`;
    const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${identifier}`;
    await Promise.all([
      redisHelpers.setex(key, OTP_TTL_SECONDS, otp),
      redisHelpers.setex(attemptsKey, OTP_TTL_SECONDS, '0'),
    ]);
  },

  async verify(identifier: string, submittedOtp: string): Promise<void> {
    const key = `${OTP_PREFIX}${identifier}`;
    const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${identifier}`;

    const stored = await redisHelpers.get(key);

    if (!stored) {
      throw new BadRequestError('OTP has expired. Please request a new one.');
    }

    // Increment attempt counter
    const attempts = await redisHelpers.incr(attemptsKey);

    if (attempts > MAX_ATTEMPTS) {
      await Promise.all([
        redisHelpers.del(key),
        redisHelpers.del(attemptsKey),
      ]);
      throw new BadRequestError(
        'Too many incorrect attempts. Please request a new OTP.',
      );
    }

    if (stored !== submittedOtp) {
      const remaining = MAX_ATTEMPTS - attempts;
      throw new BadRequestError(
        `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    // Valid — clean up
    await Promise.all([
      redisHelpers.del(key),
      redisHelpers.del(attemptsKey),
    ]);
  },

  async invalidate(identifier: string): Promise<void> {
    await Promise.all([
      redisHelpers.del(`${OTP_PREFIX}${identifier}`),
      redisHelpers.del(`${OTP_ATTEMPTS_PREFIX}${identifier}`),
    ]);
  },
};
