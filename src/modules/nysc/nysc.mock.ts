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
  {
    stateCode: 'KG/24B/1497',
    firstName: 'Happiness',
    lastName: 'Owele',
    email: 'happinessowele@gmail.com',
    phone: '09011801121',
    servingState: 'Kogi State',
    ppa: 'Kogi State Polytechnic, Lokoja',
    batch: '2024B2',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1360',
    firstName: 'Glorious',
    lastName: 'Udofot',
    email: 'sipacem248@availors.com',
    phone: '09011111111',
    servingState: 'Kogi State',
    ppa: 'Federal Ministry of Health',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1361',
    firstName: 'Test',
    lastName: 'Corper',
    email: 'tawis20899@cosdas.com',
    phone: '09022222222',
    servingState: 'Kogi State',
    ppa: 'Federal Ministry of Health',
    batch: '2025C',
    lga: 'Lokoja',
  },
];

// TODO: When NYSC API access is granted, replace NYSCMockService with NYSCApiService
// See: src/modules/nysc/nysc.api.ts (stub file ready)
