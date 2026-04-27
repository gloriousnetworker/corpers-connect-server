import { Router } from 'express';
import { postsController } from './posts.controller';
import { authenticate, optionalAuth, requireCorper } from '../auth/auth.middleware';

const router = Router();

// ── Trending + Hashtag (MUST be before /:postId) ─────────────────────────────

/** GET /api/v1/posts/trending
 *  Top posts from the last 48h ranked by engagement score.
 */
router.get('/trending', optionalAuth, postsController.trendingPosts);

/** GET /api/v1/posts/trending-hashtags
 *  Top hashtags by total usage count.
 */
router.get('/trending-hashtags', postsController.trendingHashtags);

/** GET /api/v1/posts/hashtag/:tag?cursor=&limit=
 *  Paginated public posts that contain the given hashtag.
 */
router.get('/hashtag/:tag', optionalAuth, postsController.hashtagPosts);

// ── Post CRUD ─────────────────────────────────────────────────────────────────

/** POST /api/v1/posts
 *  Create a post. Must have content OR mediaUrls. Corper-only — Marketers
 *  are limited to marketplace activity and can't author social content.
 *  Body: { content?, mediaUrls?, visibility?, postType? }
 */
router.post('/', authenticate, requireCorper, postsController.create);

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
 *  Corper-only — sharing is a social action and marketers are read-only.
 */
router.post('/:postId/share', authenticate, requireCorper, postsController.share);

/** POST /api/v1/posts/:postId/report
 *  Report a post for review. Body: { reason, details? }
 */
router.post('/:postId/report', authenticate, postsController.report);

// ── Reactions ─────────────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/react
 *  Add or update reaction. Body: { type: "LIKE"|"LOVE"|"FIRE"|"CLAP" }
 *  Replaces any existing reaction (one per user per post). Corper-only.
 */
router.post('/:postId/react', authenticate, requireCorper, postsController.react);

/** DELETE /api/v1/posts/:postId/react
 *  Remove reaction from a post. Corper-only.
 */
router.delete('/:postId/react', authenticate, requireCorper, postsController.unreact);

/** GET /api/v1/posts/:postId/reactions
 *  Paginated list of reactions with user info. Query: ?cursor=&limit=20
 */
router.get('/:postId/reactions', postsController.getReactions);

// ── Comments ──────────────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/comments
 *  Add a comment or reply. Corper-only — marketers can read but not comment.
 *  Body: { content, parentId? }  (parentId makes it a reply, max 2 levels deep)
 */
router.post('/:postId/comments', authenticate, requireCorper, postsController.addComment);

/** DELETE /api/v1/posts/:postId/comments/:commentId
 *  Delete a comment. Author of comment OR post owner can delete.
 */
router.delete('/:postId/comments/:commentId', authenticate, postsController.deleteComment);

/** GET /api/v1/posts/:postId/comments
 *  Paginated top-level comments with first 3 replies each. Query: ?cursor=&limit=20
 */
router.get('/:postId/comments', postsController.getComments);

// ── Comment Reactions ─────────────────────────────────────────────────────────

/** POST /api/v1/posts/:postId/comments/:commentId/reactions
 *  Add an emoji reaction to a comment. Corper-only.
 *  Body: { emoji }
 */
router.post('/:postId/comments/:commentId/reactions', authenticate, requireCorper, postsController.reactToComment);

/** DELETE /api/v1/posts/:postId/comments/:commentId/reactions
 *  Remove an emoji reaction from a comment. Corper-only.
 *  Body: { emoji }
 */
router.delete('/:postId/comments/:commentId/reactions', authenticate, requireCorper, postsController.removeCommentReaction);

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
