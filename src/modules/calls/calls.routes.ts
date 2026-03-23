import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { callsController } from './calls.controller';

const router = Router();

// All call routes require authentication

/** POST /api/v1/calls
 *  Initiate a call (REST fallback — Socket.IO is the primary path).
 *  Body: { receiverId, type: 'VOICE'|'VIDEO' }
 *  Returns: { callLog, callerToken, receiverToken, channelName, appId }
 */
router.post('/', authenticate, callsController.initiateCall);

/** GET /api/v1/calls
 *  Get paginated call history (sent + received).
 *  Query: cursor, limit, type?
 */
router.get('/', authenticate, callsController.getCallHistory);

/** GET /api/v1/calls/:callId
 *  Get a single call log (must be a participant).
 */
router.get('/:callId', authenticate, callsController.getCall);

/** PATCH /api/v1/calls/:callId/accept
 *  Accept an incoming call (receiver only). Returns fresh Agora token.
 */
router.patch('/:callId/accept', authenticate, callsController.acceptCall);

/** PATCH /api/v1/calls/:callId/reject
 *  Reject an incoming call (receiver only).
 */
router.patch('/:callId/reject', authenticate, callsController.rejectCall);

/** PATCH /api/v1/calls/:callId/end
 *  End an active call (either party).
 */
router.patch('/:callId/end', authenticate, callsController.endCall);

/** PATCH /api/v1/calls/:callId/miss
 *  Mark a ringing call as missed (caller: no-answer timeout).
 */
router.patch('/:callId/miss', authenticate, callsController.missCall);

/** GET /api/v1/calls/:callId/token
 *  Refresh Agora RTC token for an active/ringing call.
 */
router.get('/:callId/token', authenticate, callsController.refreshToken);

export default router;
