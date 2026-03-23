import { CorperRecord } from './nysc.types';

/**
 * NYSC Mock Database
 * ─────────────────────────────────────────────────────────────────────────────
 * Used during development until the real NYSC API access is granted.
 * When the API is ready, swap NYSCMockService → NYSCApiService in the DI
 * container (src/modules/nysc/index.ts) — all routes stay untouched.
 *
 * To add more test corpers during development, just push to this array.
 */
export const MOCK_CORPERS: CorperRecord[] = [
  {
    stateCode: 'KG/25C/1358',
    firstName: 'Iniubong',
    lastName: 'Udofot',
    email: 'udofotsx@yahoo.com',
    phone: '08024983733',
    servingState: 'Kogi State',
    ppa: 'Mega Tech Solutions Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1359',
    firstName: 'Pascal',
    lastName: 'Chukwuemerie',
    email: 'chukwuemeriepascal@outlook.com',
    phone: '08155408702',
    servingState: 'Kogi State',
    ppa: 'Mcbayan Multibix Services Limited',
    batch: '2025C',
    lga: 'Lokoja',
  },
];

// TODO: When NYSC API access is granted, replace NYSCMockService with NYSCApiService
// See: src/modules/nysc/nysc.api.ts (stub file ready)
