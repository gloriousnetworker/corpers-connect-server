import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../shared/utils/errors';
import { CallType, CallStatus } from '@prisma/client';
import { notificationsService } from '../notifications/notifications.service';
import type { InitiateCallDto, CallHistoryDto } from './calls.validation';

const DEFAULT_LIMIT = 20;
const TOKEN_EXPIRE_SECONDS = 3600; // 1 hour

const CALLER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  isVerified: true,
} as const;

// ── Agora Token ───────────────────────────────────────────────────────────────

function generateAgoraToken(channelName: string, uid: number): string {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
    // Return a placeholder when Agora credentials aren't configured
    return `dev-token:${channelName}:${uid}`;
  }

  const expireTime = Math.floor(Date.now() / 1000) + TOKEN_EXPIRE_SECONDS;

  return RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    expireTime,
  );
}

// ── Service ───────────────────────────────────────────────────────────────────

export const callsService = {
  /**
   * Initiate a call — creates a CallLog (RINGING) and generates Agora tokens
   * for both parties. The socket layer emits events after calling this.
   */
  async initiateCall(callerId: string, dto: InitiateCallDto) {
    const { receiverId, type } = dto;

    if (callerId === receiverId) throw new BadRequestError('Cannot call yourself');

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, isActive: true },
    });
    if (!receiver || !receiver.isActive) throw new NotFoundError('User not found');

    // Block check
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: callerId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: callerId },
        ],
      },
    });
    if (block) throw new ForbiddenError('Cannot call this user');

    const callLog = await prisma.callLog.create({
      data: {
        callerId,
        receiverId,
        type: type as CallType,
        status: CallStatus.RINGING,
        agoraChannelName: `call-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });

    // Generate Agora tokens for both parties (different UIDs: 1 = caller, 2 = receiver)
    const callerToken = generateAgoraToken(callLog.agoraChannelName!, 1);
    const receiverToken = generateAgoraToken(callLog.agoraChannelName!, 2);

    return {
      callLog,
      callerToken,
      receiverToken,
      channelName: callLog.agoraChannelName!,
      appId: env.AGORA_APP_ID ?? 'dev-app-id',
    };
  },

  /**
   * Accept a call — transitions RINGING → ACTIVE, returns a fresh token.
   */
  async acceptCall(callId: string, userId: string) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundError('Call not found');
    if (call.receiverId !== userId) throw new ForbiddenError('Not the receiver of this call');
    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestError(`Call is already ${call.status.toLowerCase()}`);
    }

    const updated = await prisma.callLog.update({
      where: { id: callId },
      data: { status: CallStatus.ACTIVE, startedAt: new Date() },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });

    // Fresh receiver token for the Agora channel
    const token = generateAgoraToken(updated.agoraChannelName!, 2);

    return { callLog: updated, token, channelName: updated.agoraChannelName!, appId: env.AGORA_APP_ID ?? 'dev-app-id' };
  },

  /**
   * Reject a call — transitions RINGING → REJECTED.
   */
  async rejectCall(callId: string, userId: string) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundError('Call not found');
    if (call.receiverId !== userId) throw new ForbiddenError('Not the receiver of this call');
    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestError(`Call is already ${call.status.toLowerCase()}`);
    }

    return prisma.callLog.update({
      where: { id: callId },
      data: { status: CallStatus.REJECTED, endedAt: new Date() },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });
  },

  /**
   * End a call — either party can end. Computes duration from startedAt.
   */
  async endCall(callId: string, userId: string) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundError('Call not found');
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenError('Not a participant of this call');
    }
    if (call.status === CallStatus.ENDED) {
      throw new BadRequestError('Call already ended');
    }

    const endedAt = new Date();
    const duration =
      call.startedAt ? Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000) : 0;

    return prisma.callLog.update({
      where: { id: callId },
      data: { status: CallStatus.ENDED, endedAt, duration },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });
  },

  /**
   * Mark a ringing call as MISSED (caller cancelled / receiver didn't answer).
   * Sends a CALL_MISSED notification to the receiver.
   */
  async missCall(callId: string) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundError('Call not found');
    if (call.status !== CallStatus.RINGING) return call; // Already resolved

    const updated = await prisma.callLog.update({
      where: { id: callId },
      data: { status: CallStatus.MISSED, endedAt: new Date() },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });

    // Notify the receiver about the missed call
    void notificationsService.create({
      recipientId: call.receiverId,
      actorId: call.callerId,
      type: 'CALL_MISSED',
      entityType: 'CallLog',
      entityId: callId,
      content: `Missed ${call.type.toLowerCase()} call from ${updated.caller.firstName}`,
    });

    return updated;
  },

  /**
   * Get own call history — both placed and received calls.
   */
  async getCallHistory(userId: string, dto: CallHistoryDto) {
    const { cursor, limit, type } = dto;

    const rows = await prisma.callLog.findMany({
      where: {
        OR: [{ callerId: userId }, { receiverId: userId }],
        ...(type && { type: type as CallType }),
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  },

  /**
   * Get a single call log — must be a participant.
   */
  async getCall(callId: string, userId: string) {
    const call = await prisma.callLog.findUnique({
      where: { id: callId },
      include: {
        caller: { select: CALLER_SELECT },
        receiver: { select: CALLER_SELECT },
      },
    });

    if (!call) throw new NotFoundError('Call not found');
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenError('Not a participant of this call');
    }

    return call;
  },

  /**
   * Generate a fresh Agora RTC token (for token refresh mid-call).
   */
  async refreshToken(callId: string, userId: string) {
    const call = await prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundError('Call not found');
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenError('Not a participant of this call');
    }
    if (call.status === CallStatus.ENDED || call.status === CallStatus.REJECTED) {
      throw new BadRequestError('Call is no longer active');
    }

    // UID 1 = caller, 2 = receiver
    const uid = call.callerId === userId ? 1 : 2;
    const token = generateAgoraToken(call.agoraChannelName!, uid);

    return { token, channelName: call.agoraChannelName!, appId: env.AGORA_APP_ID ?? 'dev-app-id' };
  },
};
