/**
 * Calls Socket Handler
 *
 * Socket.IO events (client → server):
 *   call:initiate   { receiverId, type }          → emits call:incoming to receiver, call:initiated to caller
 *   call:accept     { callId }                    → emits call:accepted to caller
 *   call:reject     { callId }                    → emits call:rejected to caller
 *   call:end        { callId }                    → emits call:ended to both parties
 *   call:no-answer  { callId }                    → marks missed, emits call:missed to both
 *   call:busy       { callId }                    → emits call:busy to caller
 *
 * Socket.IO events (server → client):
 *   call:incoming   { callId, callerId, caller, type, channelName, token, appId }
 *   call:initiated  { callId, channelName, token, appId }
 *   call:accepted   { callId, channelName, token, appId }
 *   call:rejected   { callId }
 *   call:ended      { callId, duration }
 *   call:missed     { callId }
 *   call:busy       { callId }
 *   call:error      { callId?, message }
 */

import type { Namespace } from 'socket.io';
import { callsService } from './calls.service';
import type { AuthenticatedSocket } from '../../config/socket';
import { socketRateLimit } from '../../shared/utils/socketRateLimiter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCallHandlers(ns: Namespace<any, any, any, any>) {
  ns.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    // Each user joins their personal room so targeted events (call:incoming,
    // call:accepted, etc.) can reach them even if they have multiple tabs open.
    void socket.join(`user:${userId}`);

    // ── call:initiate ────────────────────────────────────────────────────────
    // Rate limit: 5 call initiations per minute per user — prevents call harassment.
    socket.on(
      'call:initiate',
      async (
        data: { receiverId: string; type?: 'VOICE' | 'VIDEO' },
        ack?: (result: { success: boolean; data?: unknown; error?: string }) => void,
      ) => {
        const rl = await socketRateLimit(userId, 'call:initiate', 5, 60);
        if (!rl.allowed) {
          const error = `Rate limit exceeded. Retry in ${rl.retryAfter}s.`;
          if (ack) ack({ success: false, error });
          socket.emit('rate_limited', { event: 'call:initiate', retryAfter: rl.retryAfter });
          return;
        }

        try {
          const result = await callsService.initiateCall(userId, {
            receiverId: data.receiverId,
            type: data.type ?? 'VOICE',
          });

          const { callLog, callerToken, receiverToken, channelName, appId } = result;

          // Notify receiver
          ns.to(`user:${data.receiverId}`).emit('call:incoming', {
            callId: callLog.id,
            callerId: userId,
            caller: callLog.caller,
            type: callLog.type,
            channelName,
            token: receiverToken,
            appId,
          });

          // Acknowledge to caller
          if (ack) ack({ success: true, data: { callId: callLog.id, channelName, token: callerToken, appId } });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to initiate call';
          if (ack) ack({ success: false, error });
          socket.emit('call:error', { message: error });
        }
      },
    );

    // ── call:initiate-group ──────────────────────────────────────────────────
    socket.on(
      'call:initiate-group',
      async (
        data: { conversationId: string; type?: 'VOICE' | 'VIDEO' },
        ack?: (result: { success: boolean; data?: unknown; error?: string }) => void,
      ) => {
        const rl = await socketRateLimit(userId, 'call:initiate', 5, 60);
        if (!rl.allowed) {
          const error = `Rate limit exceeded. Retry in ${rl.retryAfter}s.`;
          if (ack) ack({ success: false, error });
          return;
        }

        try {
          const { CallType } = await import('@prisma/client');
          const result = await callsService.initiateGroupCall(
            userId,
            data.conversationId,
            (data.type ?? 'VOICE') as import('@prisma/client').CallType,
          );

          for (const member of result.memberTokens) {
            ns.to(`user:${member.userId}`).emit('call:incoming', {
              callId: result.channelName,
              callerId: userId,
              caller: result.caller,
              type: result.type,
              channelName: result.channelName,
              token: member.token,
              uid: member.uid,
              appId: result.appId,
              isGroup: true,
              groupName: result.groupName,
            });
          }

          if (ack) ack({
            success: true,
            data: {
              callId: result.channelName,
              channelName: result.channelName,
              token: result.callerToken,
              uid: result.callerUid,
              appId: result.appId,
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to initiate group call';
          if (ack) ack({ success: false, error });
          socket.emit('call:error', { message: error });
        }
      },
    );

    // ── call:accept ──────────────────────────────────────────────────────────
    socket.on(
      'call:accept',
      async (
        data: { callId: string },
        ack?: (result: { success: boolean; data?: unknown; error?: string }) => void,
      ) => {
        try {
          const result = await callsService.acceptCall(data.callId, userId);

          // Notify the caller that their call was accepted
          ns.to(`user:${result.callLog.callerId}`).emit('call:accepted', {
            callId: data.callId,
            channelName: result.channelName,
            token: result.token,
            appId: result.appId,
          });

          if (ack) ack({ success: true, data: { callId: data.callId, channelName: result.channelName, token: result.token, appId: result.appId } });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to accept call';
          if (ack) ack({ success: false, error });
          socket.emit('call:error', { callId: data.callId, message: error });
        }
      },
    );

    // ── call:reject ──────────────────────────────────────────────────────────
    socket.on(
      'call:reject',
      async (
        data: { callId: string },
        ack?: (result: { success: boolean; error?: string }) => void,
      ) => {
        try {
          const updated = await callsService.rejectCall(data.callId, userId);

          // Notify the caller
          ns.to(`user:${updated.callerId}`).emit('call:rejected', { callId: data.callId });

          if (ack) ack({ success: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to reject call';
          if (ack) ack({ success: false, error });
          socket.emit('call:error', { callId: data.callId, message: error });
        }
      },
    );

    // ── call:end ─────────────────────────────────────────────────────────────
    socket.on(
      'call:end',
      async (
        data: { callId: string },
        ack?: (result: { success: boolean; error?: string }) => void,
      ) => {
        try {
          const updated = await callsService.endCall(data.callId, userId);

          const otherPartyId =
            updated.callerId === userId ? updated.receiverId : updated.callerId;

          // Notify the other party
          ns.to(`user:${otherPartyId}`).emit('call:ended', {
            callId: data.callId,
            duration: updated.duration,
          });

          if (ack) ack({ success: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to end call';
          if (ack) ack({ success: false, error });
          socket.emit('call:error', { callId: data.callId, message: error });
        }
      },
    );

    // ── call:no-answer (timeout / caller cancelled) ──────────────────────────
    socket.on(
      'call:no-answer',
      async (
        data: { callId: string },
        ack?: (result: { success: boolean; error?: string }) => void,
      ) => {
        try {
          const updated = await callsService.missCall(data.callId);

          // Notify receiver that the call was missed
          ns.to(`user:${updated.receiverId}`).emit('call:missed', { callId: data.callId });

          if (ack) ack({ success: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to mark call as missed';
          if (ack) ack({ success: false, error });
        }
      },
    );

    // ── call:busy (receiver is in another call) ───────────────────────────────
    socket.on(
      'call:busy',
      async (
        data: { callId: string },
        ack?: (result: { success: boolean; error?: string }) => void,
      ) => {
        try {
          // Reject with REJECTED status
          const updated = await callsService.rejectCall(data.callId, userId);

          // Notify caller that receiver is busy
          ns.to(`user:${updated.callerId}`).emit('call:busy', { callId: data.callId });

          if (ack) ack({ success: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to mark call as busy';
          if (ack) ack({ success: false, error });
        }
      },
    );
  });
}
