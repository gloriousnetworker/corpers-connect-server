import { Router } from 'express';
import { feedController } from './feed.controller';
import { authenticate } from '../auth/auth.middleware';

const router = Router();

/** GET /api/v1/feed
 *  Home feed — cursor-based, most recent first.
 *  Includes: own posts, followed users' posts, same-state PUBLIC/STATE posts.
 *  Excludes: flagged posts, blocked users, ONLY_ME posts of others.
 *  Auth required.
 *  Query: ?cursor=<postId>&limit=20
 */
router.get('/', authenticate, feedController.getHomeFeed);

export default router;
