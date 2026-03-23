import { Router } from 'express';
import { discoverController } from './discover.controller';
import { authenticate, optionalAuth } from '../auth/auth.middleware';

const router = Router();

/** GET /api/v1/discover/corpers
 *  Returns corpers in the same serving state as the authenticated user.
 *  Excludes users already blocked or blocking.
 *  Query: ?cursor=&limit=20
 */
router.get('/corpers', authenticate, discoverController.getCorpersInState);

/** GET /api/v1/discover/suggestions
 *  Follow suggestions — same state first, then other states.
 *  Excludes already-followed, blocked, and self.
 *  Query: ?limit=20
 */
router.get('/suggestions', authenticate, discoverController.getSuggestions);

/** GET /api/v1/discover/search
 *  Search users by first/last name or state code (partial, case-insensitive).
 *  Query: ?q=Iniubong&cursor=&limit=20
 *  Auth optional — authenticated users also have blocked users filtered out.
 */
router.get('/search', optionalAuth, discoverController.search);

export default router;
