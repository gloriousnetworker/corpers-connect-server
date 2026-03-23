import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate, optionalAuth } from '../auth/auth.middleware';

const router = Router();

// ── Own Profile (authenticated) ───────────────────────────────────────────────

/** GET /api/v1/users/me
 *  Returns the authenticated user's full profile + follow counts.
 */
router.get('/me', authenticate, usersController.getMe);

/** PATCH /api/v1/users/me
 *  Update bio, corperTag toggle, or corperTagLabel.
 *  Body: { bio?, corperTag?, corperTagLabel? }
 */
router.patch('/me', authenticate, usersController.updateMe);

/** POST /api/v1/users/me/onboard
 *  Mark user as onboarded (sets isOnboarded: true, isFirstLogin: false).
 *  Body: { bio?, corperTag?, corperTagLabel? }
 */
router.post('/me/onboard', authenticate, usersController.onboard);

/** POST /api/v1/users/me/avatar
 *  Upload profile picture. multipart/form-data, field name: "avatar".
 *  Max 5MB. Uploaded to Cloudinary — returns updated profile with new URL.
 */
router.post('/me/avatar', authenticate, usersController.uploadAvatar);

/** GET /api/v1/users/me/blocked
 *  Returns a list of users blocked by the authenticated user.
 */
router.get('/me/blocked', authenticate, usersController.getBlockedUsers);

// ── Public Profile ────────────────────────────────────────────────────────────

/** GET /api/v1/users/:userId
 *  Public profile. Returns sanitised profile + follow counts.
 *  If authenticated, also returns isFollowing flag.
 *  Returns 404 if either party has blocked the other.
 */
router.get('/:userId', optionalAuth, usersController.getProfile);

// ── Follow ────────────────────────────────────────────────────────────────────

/** POST /api/v1/users/:userId/follow
 *  Follow a user. Idempotent.
 */
router.post('/:userId/follow', authenticate, usersController.follow);

/** DELETE /api/v1/users/:userId/follow
 *  Unfollow a user.
 */
router.delete('/:userId/follow', authenticate, usersController.unfollow);

/** GET /api/v1/users/:userId/followers
 *  Paginated list of followers. Query: ?cursor=&limit=20
 */
router.get('/:userId/followers', usersController.getFollowers);

/** GET /api/v1/users/:userId/following
 *  Paginated list of users this user follows. Query: ?cursor=&limit=20
 */
router.get('/:userId/following', usersController.getFollowing);

/** GET /api/v1/users/:userId/is-following
 *  Returns { isFollowing: boolean } for the authenticated user → target.
 */
router.get('/:userId/is-following', authenticate, usersController.isFollowing);

// ── Block ─────────────────────────────────────────────────────────────────────

/** POST /api/v1/users/:userId/block
 *  Block a user. Also removes existing follow relationships.
 */
router.post('/:userId/block', authenticate, usersController.blockUser);

/** DELETE /api/v1/users/:userId/block
 *  Unblock a user.
 */
router.delete('/:userId/block', authenticate, usersController.unblockUser);

export default router;
