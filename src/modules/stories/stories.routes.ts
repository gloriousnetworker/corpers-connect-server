import { Router } from 'express';
import { storiesController } from './stories.controller';
import { authenticate } from '../auth/auth.middleware';
import { mediaUpload } from '../../shared/middleware/upload.middleware';

const router = Router();

/** POST /api/v1/stories — upload a new story (image or video, 24h expiry) */
router.post('/', authenticate, mediaUpload, storiesController.createStory);

/** GET /api/v1/stories — feed of stories from followed users + own, grouped by author */
router.get('/', authenticate, storiesController.getStories);

/** POST /api/v1/stories/:storyId/view — mark a story as viewed */
router.post('/:storyId/view', authenticate, storiesController.viewStory);

/** DELETE /api/v1/stories/:storyId — delete own story */
router.delete('/:storyId', authenticate, storiesController.deleteStory);

/** POST /api/v1/stories/:storyId/highlight — add story to highlights */
router.post('/:storyId/highlight', authenticate, storiesController.addHighlight);

/** DELETE /api/v1/stories/:storyId/highlight — remove story from highlights */
router.delete('/:storyId/highlight', authenticate, storiesController.removeHighlight);

/** GET /api/v1/stories/users/:userId/highlights — get a user's highlights */
router.get('/users/:userId/highlights', storiesController.getUserHighlights);

export default router;
