import { redisHelpers } from '../../config/redis';
import { NotFoundError, BadRequestError } from '../../shared/utils/errors';
import { MOCK_CORPERS } from './nysc.mock';
import { CorperRecord, INYSCService } from './nysc.types';

/**
 * All 37 Nigerian state NYSC prefixes (36 states + FCT)
 */
const STATE_PREFIXES = [
  'AB', 'AD', 'AK', 'AN', 'BA', 'BY', 'BN', 'BO', 'CR', 'DT',
  'EB', 'ED', 'EK', 'EN', 'FC', 'GM', 'IM', 'JG', 'KD', 'KN',
  'KT', 'KB', 'KG', 'KW', 'LA', 'NS', 'NG', 'OG', 'OD', 'OS',
  'OY', 'PL', 'RV', 'SO', 'TR', 'YB', 'ZM',
];

const STATE_CODE_REGEX = new RegExp(
  `^(${STATE_PREFIXES.join('|')})\\/\\d{2}[A-C]\\/\\d{4,5}$`,
);

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export class NYSCMockService implements INYSCService {
  isValidStateCodeFormat(stateCode: string): boolean {
    return STATE_CODE_REGEX.test(stateCode.toUpperCase());
  }

  async getCorperByStateCode(stateCode: string): Promise<CorperRecord> {
    const normalised = stateCode.toUpperCase().trim();

    if (!this.isValidStateCodeFormat(normalised)) {
      throw new BadRequestError(
        `Invalid state code format. Expected format: KG/25C/1358`,
      );
    }

    // Check Redis cache first
    const cacheKey = `nysc:corper:${normalised}`;
    const cached = await redisHelpers.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as CorperRecord;
    }

    // Look up in mock data (case-insensitive state code)
    const record = MOCK_CORPERS.find(
      (c) => c.stateCode.toUpperCase() === normalised,
    );

    if (!record) {
      throw new NotFoundError(
        `State code ${normalised} was not found in the NYSC database. ` +
          `Please verify your state code and try again.`,
      );
    }

    // Cache for 24 hours
    await redisHelpers.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(record));

    return record;
  }
}

// TODO: NYSCApiService — implement this when NYSC API access is granted
// It must implement INYSCService so the swap is a one-liner in the DI container.
// export class NYSCApiService implements INYSCService { ... }

// Singleton export — swap to NYSCApiService here when ready
export const nyscService: INYSCService = new NYSCMockService();
