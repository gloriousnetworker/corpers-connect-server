/**
 * Unit tests for join-requests.service — mocks Prisma + email.
 */

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    approvedCorper: { findUnique: jest.fn(), create: jest.fn() },
    joinRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../shared/services/email.service', () => ({
  emailService: {
    sendJoinRequestReceived: jest.fn().mockResolvedValue(undefined),
    sendJoinRequestApproved: jest.fn().mockResolvedValue(undefined),
    sendJoinRequestRejected: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    CLIENT_URL: 'https://test.corpersconnect.com',
  },
}));

jest.mock('../../modules/nysc/nysc.service', () => ({
  nyscService: {
    getCorperByStateCode: jest.fn(),
  },
}));

import { prisma } from '../../config/prisma';
import { emailService } from '../../shared/services/email.service';
import { nyscService } from '../../modules/nysc/nysc.service';
import { joinRequestsService } from '../../modules/join-requests/join-requests.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => jest.clearAllMocks());

// ── submit ────────────────────────────────────────────────────────────────────

describe('joinRequestsService.submit', () => {
  const dto = {
    firstName: 'Iniubong',
    lastName: 'Udofot',
    email: 'test@example.com',
    stateCode: 'KG/25C/9999',
    servingState: 'Kogi State',
    batch: '2025C',
  };

  // Helper: make nyscService throw NotFoundError (state code not in NYSC DB — expected path)
  const mockNyscNotFound = () =>
    (nyscService.getCorperByStateCode as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );

  it('creates a new join request when no conflicts', async () => {
    mockNyscNotFound();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.joinRequest.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.joinRequest.create as jest.Mock).mockResolvedValue({ id: 'jr1', ...dto, status: 'PENDING' });

    const result = await joinRequestsService.submit(dto, 'https://cdn.com/doc.pdf');

    expect(mockPrisma.joinRequest.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PENDING');
  });

  it('throws ConflictError if state code already in NYSC database', async () => {
    (nyscService.getCorperByStateCode as jest.Mock).mockResolvedValue({ stateCode: dto.stateCode });

    await expect(joinRequestsService.submit(dto, 'doc.pdf')).rejects.toThrow(/registration page|register/i);
  });

  it('throws ConflictError if user already registered', async () => {
    mockNyscNotFound();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1' });

    await expect(joinRequestsService.submit(dto, 'doc.pdf')).rejects.toThrow(/already registered/i);
  });

  it('throws ConflictError if previous join request was already approved', async () => {
    mockNyscNotFound();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.joinRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'jr1', status: 'APPROVED' });

    await expect(joinRequestsService.submit(dto, 'doc.pdf')).rejects.toThrow(/already approved/i);
  });

  it('throws ConflictError if pending request exists', async () => {
    mockNyscNotFound();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.joinRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'jr1', status: 'PENDING' });

    await expect(joinRequestsService.submit(dto, 'doc.pdf')).rejects.toThrow(/pending/i);
  });

  it('allows resubmission if previous request was rejected', async () => {
    mockNyscNotFound();
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.joinRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'jr1', status: 'REJECTED' });
    (mockPrisma.joinRequest.update as jest.Mock).mockResolvedValue({ id: 'jr1', ...dto, status: 'PENDING' });

    const result = await joinRequestsService.submit(dto, 'doc.pdf');

    expect(mockPrisma.joinRequest.update).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PENDING');
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('joinRequestsService.list', () => {
  it('returns paginated items with hasMore flag', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ id: `jr${i}`, status: 'PENDING' }));
    (mockPrisma.joinRequest.findMany as jest.Mock).mockResolvedValue(items);

    const result = await joinRequestsService.list(undefined, undefined, 20);

    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('jr19');
  });

  it('filters by status', async () => {
    (mockPrisma.joinRequest.findMany as jest.Mock).mockResolvedValue([]);

    await joinRequestsService.list('PENDING');

    expect(mockPrisma.joinRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING' },
      }),
    );
  });
});

// ── approve ──────────────────────────────────────────────────────────────────

describe('joinRequestsService.approve', () => {
  const pendingRequest = {
    id: 'jr1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: null,
    stateCode: 'KG/25C/9999',
    servingState: 'Kogi State',
    lga: null,
    ppa: null,
    batch: '2025C',
    status: 'PENDING',
  };

  it('creates ApprovedCorper and updates request status', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue(pendingRequest);
    (mockPrisma.approvedCorper.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.joinRequest.update as jest.Mock).mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });

    const result = await joinRequestsService.approve('jr1', 'admin1', 'Looks good');

    expect(mockPrisma.approvedCorper.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.joinRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(emailService.sendJoinRequestApproved).toHaveBeenCalledWith(
      'test@example.com',
      'Test',
      expect.stringContaining('/register'),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('throws NotFoundError if request does not exist', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(joinRequestsService.approve('nope', 'admin1')).rejects.toThrow(/not found/i);
  });

  it('throws BadRequestError if request is not pending', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });

    await expect(joinRequestsService.approve('jr1', 'admin1')).rejects.toThrow(/already approved/i);
  });
});

// ── reject ───────────────────────────────────────────────────────────────────

describe('joinRequestsService.reject', () => {
  const pendingRequest = {
    id: 'jr1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    stateCode: 'KG/25C/9999',
    status: 'PENDING',
  };

  it('updates request status and sends rejection email', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue(pendingRequest);
    (mockPrisma.joinRequest.update as jest.Mock).mockResolvedValue({ ...pendingRequest, status: 'REJECTED' });

    const result = await joinRequestsService.reject('jr1', 'admin1', 'Invalid document');

    expect(mockPrisma.joinRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', reviewNote: 'Invalid document' }),
      }),
    );
    expect(emailService.sendJoinRequestRejected).toHaveBeenCalledWith(
      'test@example.com',
      'Test',
      'Invalid document',
    );
    expect(result.status).toBe('REJECTED');
  });

  it('throws NotFoundError if request does not exist', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(joinRequestsService.reject('nope', 'admin1')).rejects.toThrow(/not found/i);
  });
});

// ── getStatusByEmail ─────────────────────────────────────────────────────────

describe('joinRequestsService.getStatusByEmail', () => {
  it('returns request status for valid email', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue({
      id: 'jr1',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    const result = await joinRequestsService.getStatusByEmail('test@example.com');
    expect(result).toHaveProperty('status', 'PENDING');
  });

  it('returns null if no request exists', async () => {
    (mockPrisma.joinRequest.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await joinRequestsService.getStatusByEmail('noone@example.com');
    expect(result).toBeNull();
  });
});
