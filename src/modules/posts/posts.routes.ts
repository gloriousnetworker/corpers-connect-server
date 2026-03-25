import { Router } from 'express';
import { postsController } from './posts.controller';
import { authenticate, optionalAuth } from '../auth/auth.middleware';

const router = Router();

// ── Post CRUD ─────────────────────────────────────────────────────────────────

/** POST /api/v1/posts
 *  Create a post. Must have content OR mediaUrls.
 *  Body: { content?, mediaUrls?, visibility?, postType? }
 */
router.post('/', authenticate, postsController.create);

/** GET /api/v1/posts/:postId
 *  Get a single post. Respects visibility rules. Auth optional.
 */
router.get('/:postId', optionalAuth, postsController.getOne);

/** PATCH /api/v1/posts/:postId
 *  Edit a post. Only the author can edit within 15 minutes of creation.
 */
router.patch('/:postId', authenticate, postsController.update);

/** DELETE /api/v1/posts/:postId
 *  Delete a post. Author only.
 */
router.delete('/:postId', authenticate, postsController.remove);

/** POST /api/v1/posts/:postId/share
 *  Record a share event for a post. Increments sharesCount by 1.
 *  Call this after the native share sheet confirms the share.
 */
router.post('/:postId/share', authenticate, postsController.share);

/** POST /api/v1/posts/:postId/report
 *  Report a post for review. Body: { reason, details? }
 */
router.post('/:postId/report', authenticate, postsController.report);

// ── Reactions ─────────────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/react
 *  Add or update reaction. Body: { type: "LIKE"|"LOVE"|"FIRE"|"CLAP" }
 *  Replaces any existing reaction (one per user per post).
 */
router.post('/:postId/react', authenticate, postsController.react);

/** DELETE /api/v1/posts/:postId/react
 *  Remove reaction from a post.
 */
router.delete('/:postId/react', authenticate, postsController.unreact);

/** GET /api/v1/posts/:postId/reactions
 *  Paginated list of reactions with user info. Query: ?cursor=&limit=20
 */
router.get('/:postId/reactions', postsController.getReactions);

// ── Comments ──────────────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/comments
 *  Add a comment or reply.
 *  Body: { content, parentId? }  (parentId makes it a reply, max 2 levels deep)
 */
router.post('/:postId/comments', authenticate, postsController.addComment);

/** DELETE /api/v1/posts/:postId/comments/:commentId
 *  Delete a comment. Author of comment OR post owner can delete.
 */
router.delete('/:postId/comments/:commentId', authenticate, postsController.deleteComment);

/** GET /api/v1/posts/:postId/comments
 *  Paginated top-level comments with first 3 replies each. Query: ?cursor=&limit=20
 */
router.get('/:postId/comments', postsController.getComments);

// ── Bookmarks ─────────────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/bookmark
 *  Bookmark a post. Idempotent.
 */
router.post('/:postId/bookmark', authenticate, postsController.bookmark);

/** DELETE /api/v1/posts/:postId/bookmark
 *  Remove bookmark. Idempotent.
 */
router.delete('/:postId/bookmark', authenticate, postsController.unbookmark);

export default router;
