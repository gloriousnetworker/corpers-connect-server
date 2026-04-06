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
  {
    stateCode: 'KG/25C/1362',
    firstName: 'Rebecca',
    lastName: 'Okon',
    email: 'rapebak413@marvetos.com',
    phone: '09033333333',
    servingState: 'Kogi State',
    ppa: 'Federal Medical Centre Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1363',
    firstName: 'Mivid',
    lastName: 'Tester',
    email: 'mivid92782@nexafilm.com',
    phone: '09044444444',
    servingState: 'Kogi State',
    ppa: 'National Youth Service Corps Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1364',
    firstName: 'Kotopem',
    lastName: 'Adeolu',
    email: 'kotopem927@marvetos.com',
    phone: '09055555555',
    servingState: 'Kogi State',
    ppa: 'NYSC Secretariat Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1365',
    firstName: 'Vacoli',
    lastName: 'Eke',
    email: 'vacoli7810@nexafilm.com',
    phone: '09066666666',
    servingState: 'Kogi State',
    ppa: 'NYSC State Secretariat Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
  {
    stateCode: 'KG/25C/1366',
    firstName: 'Xiyoki',
    lastName: 'Nnamdi',
    email: 'xiyoki3216@nyspring.com',
    phone: '09077777777',
    servingState: 'Kogi State',
    ppa: 'Federal Polytechnic Lokoja',
    batch: '2025C',
    lga: 'Lokoja',
  },
];

// TODO: When NYSC API access is granted, replace NYSCMockService with NYSCApiService
// See: src/modules/nysc/nysc.api.ts (stub file ready)
