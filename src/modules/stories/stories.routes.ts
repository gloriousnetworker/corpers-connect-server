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

/** POST /api/v1/stories/:storyId/react — toggle love reaction on a story */
router.post('/:storyId/react', authenticate, storiesController.reactToStory);

/** POST /api/v1/stories/:storyId/reply — reply to a story (sends as DM) */
router.post('/:storyId/reply', authenticate, storiesController.replyToStory);

/** GET /api/v1/stories/:storyId — get a single story by ID */
router.get('/:storyId', authenticate, storiesController.getStoryById);

/** GET /api/v1/stories/:storyId/viewers — get viewers + reactors (own stories) */
router.get('/:storyId/viewers', authenticate, storiesController.getStoryViewers);

/** GET /api/v1/stories/users/:userId/highlights — get a user's highlights */
router.get('/users/:userId/highlights', storiesController.getUserHighlights);

export default router;
