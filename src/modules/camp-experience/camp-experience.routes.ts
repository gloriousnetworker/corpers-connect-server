import { Router } from 'express';
import { campExperienceController } from './camp-experience.controller';
import { authenticate, optionalAuth } from '../auth/auth.middleware';

const router = Router();

/** POST /api/v1/camp-experience/days
 *  Create or update one of the caller's 21 camp days.
 *  Body: { dayNumber (1..21), title?, story?, mood?, mediaUrls?, taggedUserIds?, visibility? }
 */
router.post('/days', authenticate, campExperienceController.upsertDay);

/** GET /api/v1/camp-experience/me
 *  Caller's own 21-day grid (returns all slots including PRIVATE entries).
 */
router.get('/me', authenticate, campExperienceController.getMyDays);

/** GET /api/v1/camp-experience/users/:userId
 *  Another user's 21-day grid. Filters by visibility (FRIENDS requires follow).
 */
router.get('/users/:userId', optionalAuth, campExperienceController.getUserDays);

/** GET /api/v1/camp-experience/users/:userId/days/:dayNumber
 *  A single day entry for a user. Respects visibility.
 */
router.get('/users/:userId/days/:dayNumber', optionalAuth, campExperienceController.getDay);

/** DELETE /api/v1/camp-experience/days/:dayNumber
 *  Delete the caller's entry for a given day (1..21).
 */
router.delete('/days/:dayNumber', authenticate, campExperienceController.deleteDay);

export default router;
