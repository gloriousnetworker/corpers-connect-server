import { prisma } from '../../config/prisma';
import { emailService } from '../../shared/services/email.service';
import { env } from '../../config/env';
import { nyscService } from '../nysc/nysc.service';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../../shared/utils/errors';
import type { SubmitJoinRequestDto } from './join-requests.validation';

const DEFAULT_LIMIT = 20;

export const joinRequestsService = {
  // ── Submit a join request (public — no auth required) ─────────────────────

  async submit(dto: SubmitJoinRequestDto, documentUrl: string) {
    const normalised = dto.stateCode.toUpperCase().trim();
    const emailLower = dto.email.toLowerCase().trim();

    // Check if state code already exists in NYSC database (mock or approved)
    // — if so, the user should register directly, not submit a join request.
    try {
      await nyscService.getCorperByStateCode(normalised);
      // If we get here, the corper exists — they should register instead
      throw new ConflictError(
        'Your state code is already in our database. Please go to the registration page and sign up directly.',
      );
    } catch (err) {
      // NotFoundError means the code isn't in the NYSC database — that's expected, continue
      if (err instanceof ConflictError) throw err;
      // Any other error (NotFoundError, BadRequestError) means they need the join flow
    }

    // Check if state code already exists in User table (already registered)
    const existingUser = await prisma.user.findUnique({ where: { stateCode: normalised } });
    if (existingUser) {
      throw new ConflictError('A user with this state code is already registered. Please login instead.');
    }

    // Check for existing pending/approved join request
    const existingRequest = await prisma.joinRequest.findFirst({
      where: {
        OR: [{ stateCode: normalised }, { email: emailLower }],
      },
    });

    if (existingRequest) {
      if (existingRequest.status === 'PENDING') {
        throw new ConflictError('You already have a pending join request. Please wait for admin review.');
      }
      if (existingRequest.status === 'APPROVED') {
        throw new ConflictError('Your request was already approved. You can register now.');
      }
      // REJECTED — allow resubmission by updating the existing record
      const resubmitted = await prisma.joinRequest.update({
        where: { id: existingRequest.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: emailLower,
          phone: dto.phone,
          stateCode: normalised,
          servingState: dto.servingState,
          lga: dto.lga,
          ppa: dto.ppa,
          batch: dto.batch,
          documentUrl,
          status: 'PENDING',
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
        },
      });
      emailService
        .sendJoinRequestReceived(resubmitted.email, resubmitted.firstName)
        .catch((err) => console.error('[EMAIL] Join request resubmission email failed:', err));
      return resubmitted;
    }

    const created = await prisma.joinRequest.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: emailLower,
        phone: dto.phone,
        stateCode: normalised,
        servingState: dto.servingState,
        lga: dto.lga,
        ppa: dto.ppa,
        batch: dto.batch,
        documentUrl,
      },
    });

    // Confirmation email — fire-and-forget so a failed send won't block the response
    emailService
      .sendJoinRequestReceived(created.email, created.firstName)
      .catch((err) => console.error('[EMAIL] Join request confirmation email failed:', err));

    return created;
  },

  // ── Check status by email (public) ────────────────────────────────────────

  async getStatusByEmail(email: string) {
    const request = await prisma.joinRequest.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
    return request;
  },

  // ── Admin: list join requests ─────────────────────────────────────────────

  async list(status?: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const where = status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {};

    const rows = await prisma.joinRequest.findMany({
      where,
      include: {
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  },

  // ── Admin: approve a join request ─────────────────────────────────────────

  async approve(requestId: string, adminId: string, reviewNote?: string) {
    const request = await prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestError(`Request is already ${request.status.toLowerCase()}`);
    }

    // Create ApprovedCorper record so the NYSC lookup service finds them
    await prisma.approvedCorper.create({
      data: {
        stateCode: request.stateCode,
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        phone: request.phone,
        servingState: request.servingState,
        lga: request.lga,
        ppa: request.ppa,
        batch: request.batch,
      },
    });

    // Update join request status
    const updated = await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reviewNote: reviewNote || 'Approved',
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    // Send approval email
    try {
      await emailService.sendJoinRequestApproved(
        request.email,
        request.firstName,
        `${env.CLIENT_URL}/register`,
      );
    } catch (err) {
      console.error(`[EMAIL] Failed to send approval email to ${request.email}:`, err);
    }

    return updated;
  },

  // ── Admin: reject a join request ──────────────────────────────────────────

  async reject(requestId: string, adminId: string, reviewNote?: string) {
    const request = await prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundError('Join request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestError(`Request is already ${request.status.toLowerCase()}`);
    }

    const reason = reviewNote || 'Your request did not meet the requirements.';

    const updated = await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewNote: reason,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    // Send rejection email
    try {
      await emailService.sendJoinRequestRejected(
        request.email,
        request.firstName,
        reason,
      );
    } catch (err) {
      console.error(`[EMAIL] Failed to send rejection email to ${request.email}:`, err);
    }

    return updated;
  },
};
