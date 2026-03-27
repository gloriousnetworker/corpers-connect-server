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
router.get('/:userId/followers', optionalAuth, usersController.getFollowers);

/** GET /api/v1/users/:userId/following
 *  Paginated list of users this user follows. Query: ?cursor=&limit=20
 */
router.get('/:userId/following', optionalAuth, usersController.getFollowing);

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

// ── Content ───────────────────────────────────────────────────────────────────

/** GET /api/v1/users/:userId/posts
 *  Paginated posts by a user (visibility rules apply). Optional auth.
 */
router.get('/:userId/posts', optionalAuth, usersController.getUserPosts);

/** GET /api/v1/users/me/bookmarks
 *  Authenticated user's bookmarked posts.
 */
router.get('/me/bookmarks', authenticate, usersController.getBookmarks);

/** GET /api/v1/users/:userId/highlights
 *  Story highlights for a user's profile.
 */
router.get('/:userId/highlights', usersController.getUserHighlights);

// ── FCM Tokens ────────────────────────────────────────────────────────────────

/** POST /api/v1/users/me/fcm-token
 *  Register a device FCM token for push notifications.
 *  Body: { token: string }
 */
router.post('/me/fcm-token', authenticate, usersController.addFcmToken);

/** DELETE /api/v1/users/me/fcm-token
 *  Remove a device FCM token (e.g., on logout).
 *  Body: { token: string }
 */
router.delete('/me/fcm-token', authenticate, usersController.removeFcmToken);

/** DELETE /api/v1/users/me
 *  Soft-delete the authenticated user's account (deactivates, anonymises data).
 */
router.delete('/me', authenticate, usersController.deleteAccount);

export default router;
