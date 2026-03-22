import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from './auth.middleware';
import { authRateLimiter } from '../../shared/middleware/rateLimiter';

const router = Router();

// ── Public Routes ─────────────────────────────────────────────────────────────

/** POST /api/v1/auth/lookup
 *  Lookup a corper's details from NYSC DB by state code.
 *  Returns read-only NYSC data for registration confirmation.
 */
router.post('/lookup', authRateLimiter, authController.lookup);

/** POST /api/v1/auth/register/initiate
 *  Step 1 of registration: submit state code + password.
 *  Sends OTP to NYSC-registered email.
 */
router.post('/register/initiate', authRateLimiter, authController.registerInitiate);

/** POST /api/v1/auth/register/verify
 *  Step 2 of registration: submit OTP.
 *  Creates account and returns tokens.
 */
router.post('/register/verify', authRateLimiter, authController.registerVerify);

/** POST /api/v1/auth/login
 *  Login with email or state code + password.
 *  If 2FA is enabled, returns a challenge token instead of JWT tokens.
 */
router.post('/login', authRateLimiter, authController.login);

/** POST /api/v1/auth/2fa/challenge
 *  Complete 2FA login step. Submit TOTP code + challengeToken.
 *  Returns JWT tokens on success.
 */
router.post('/2fa/challenge', authRateLimiter, authController.twoFAChallenge);

/** POST /api/v1/auth/refresh
 *  Refresh access token using a valid refresh token.
 *  Old refresh token is rotated (single-use).
 */
router.post('/refresh', authController.refresh);

/** POST /api/v1/auth/forgot-password
 *  Request a password reset OTP sent to registered email.
 */
router.post('/forgot-password', authRateLimiter, authController.forgotPassword);

/** POST /api/v1/auth/reset-password
 *  Reset password with OTP verification.
 */
router.post('/reset-password', authController.resetPassword);

// ── Authenticated Routes ──────────────────────────────────────────────────────

/** POST /api/v1/auth/logout
 *  Revoke current session and block the access token.
 */
router.post('/logout', authenticate, authController.logout);

/** PUT /api/v1/auth/change-password
 *  Change password (requires current password).
 */
router.put('/change-password', authenticate, authController.changePassword);

// ── 2FA Management ────────────────────────────────────────────────────────────

/** POST /api/v1/auth/2fa/enable
 *  Initiate 2FA setup: returns TOTP secret + QR code.
 */
router.post('/2fa/enable', authenticate, authController.initiate2FA);

/** POST /api/v1/auth/2fa/verify-enable
 *  Confirm 2FA setup with TOTP code. Activates 2FA.
 */
router.post('/2fa/verify-enable', authenticate, authController.confirm2FA);

/** POST /api/v1/auth/2fa/disable
 *  Disable 2FA (requires current TOTP code to confirm).
 */
router.post('/2fa/disable', authenticate, authController.disable2FA);

// ── Session Management ────────────────────────────────────────────────────────

/** GET /api/v1/auth/sessions
 *  List all active sessions for the authenticated user.
 */
router.get('/sessions', authenticate, authController.getSessions);

/** DELETE /api/v1/auth/sessions/:sessionId
 *  Revoke a specific session.
 */
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

/** DELETE /api/v1/auth/sessions
 *  Revoke all sessions except the current one.
 */
router.delete('/sessions', authenticate, authController.revokeAllSessions);

export default router;
