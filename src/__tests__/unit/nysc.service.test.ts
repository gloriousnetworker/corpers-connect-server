import { NYSCMockService } from '../../modules/nysc/nysc.service';
import { BadRequestError, NotFoundError } from '../../shared/utils/errors';

// Mock Redis so unit tests don't need a real connection
jest.mock('../../config/redis', () => ({
  redis: { connect: jest.fn(), quit: jest.fn() },
  redisHelpers: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

const service = new NYSCMockService();

describe('NYSCMockService', () => {
  describe('getCorperByStateCode', () => {
    it('returns corper record for valid state code', async () => {
      const result = await service.getCorperByStateCode('KG/25C/1358');
      expect(result.firstName).toBe('Iniubong');
      expect(result.lastName).toBe('Udofot');
      expect(result.email).toBe('udofotsx@yahoo.com');
      expect(result.servingState).toBe('Kogi State');
    });

    it('is case-insensitive', async () => {
      const result = await service.getCorperByStateCode('kg/25c/1358');
      expect(result.stateCode).toBe('KG/25C/1358');
    });

    it('throws BadRequestError for invalid state code format', async () => {
      await expect(service.getCorperByStateCode('INVALID')).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError for wrong separator', async () => {
      await expect(service.getCorperByStateCode('KG-25C-1358')).rejects.toThrow(BadRequestError);
    });

    it('throws NotFoundError for valid format but unknown code', async () => {
      await expect(service.getCorperByStateCode('KG/25C/9999')).rejects.toThrow(NotFoundError);
    });

    it('throws BadRequestError for invalid state prefix', async () => {
      await expect(service.getCorperByStateCode('XX/25C/1358')).rejects.toThrow(BadRequestError);
    });
  });
});
