import { redisHelpers } from '../../config/redis';
import { prisma } from '../../config/prisma';
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

    // 1. Look up in hardcoded mock data
    const mockRecord = MOCK_CORPERS.find(
      (c) => c.stateCode.toUpperCase() === normalised,
    );

    if (mockRecord) {
      await redisHelpers.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(mockRecord));
      return mockRecord;
    }

    // 2. Look up in ApprovedCorper table (admin-approved join requests)
    const approved = await prisma.approvedCorper.findUnique({
      where: { stateCode: normalised },
    });

    if (approved) {
      const record: CorperRecord = {
        stateCode: approved.stateCode,
        firstName: approved.firstName,
        lastName: approved.lastName,
        email: approved.email,
        phone: approved.phone ?? undefined,
        servingState: approved.servingState,
        lga: approved.lga ?? undefined,
        ppa: approved.ppa ?? undefined,
        batch: approved.batch,
      };
      await redisHelpers.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(record));
      return record;
    }

    // Not found anywhere
    throw new NotFoundError(
      `State code ${normalised} was not found in the NYSC database. ` +
        `If you're a corps member, you can request to join via the app.`,
    );
  }
}

// TODO: NYSCApiService — implement this when NYSC API access is granted
// It must implement INYSCService so the swap is a one-liner in the DI container.
// export class NYSCApiService implements INYSCService { ... }

// Singleton export — swap to NYSCApiService here when ready
export const nyscService: INYSCService = new NYSCMockService();
