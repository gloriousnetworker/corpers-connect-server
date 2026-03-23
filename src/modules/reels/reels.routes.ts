import { Router } from 'express';
import { reelsController } from './reels.controller';
import { authenticate } from '../auth/auth.middleware';
import { mediaUpload } from '../../shared/middleware/upload.middleware';

const router = Router();

/** POST /api/v1/reels — upload a new reel (image or video) */
router.post('/', authenticate, mediaUpload, reelsController.createReel);

/** GET /api/v1/reels — followed users' reels feed */
router.get('/', authenticate, reelsController.getReelsFeed);

/** GET /api/v1/reels/explore — public reels from everyone */
router.get('/explore', authenticate, reelsController.exploreReels);

/** GET /api/v1/reels/:reelId — get a single reel */
router.get('/:reelId', reelsController.getReel);

export default router;
