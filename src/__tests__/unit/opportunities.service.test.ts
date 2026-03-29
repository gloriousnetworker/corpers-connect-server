/**
 * Unit tests for opportunitiesService — Prisma is mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/prisma', () => ({
  prisma: {
    opportunity: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    opportunityApplication: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    savedOpportunity: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { opportunitiesService } from '../../modules/opportunities/opportunities.service';
import { prisma } from '../../config/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const AUTHOR_ID = 'author-1';
const APPLICANT_ID = 'applicant-1';
const OPP_ID = 'opp-1';
const APP_ID = 'app-1';

const mockOpportunity = {
  id: OPP_ID,
  authorId: AUTHOR_ID,
  title: 'Software Engineer',
  description: 'Great role',
  type: 'JOB',
  companyName: 'Acme Corp',
  location: 'Lagos',
  isRemote: false,
  salary: '300k',
  deadline: null,
  requirements: null,
  contactEmail: null,
  companyWebsite: null,
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: AUTHOR_ID, firstName: 'Test', lastName: 'Author', profilePicture: null },
  _count: { applications: 0 },
};

const mockApplication = {
  id: APP_ID,
  opportunityId: OPP_ID,
  applicantId: APPLICANT_ID,
  coverLetter: 'I am great',
  cvUrl: null,
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
  applicant: { id: APPLICANT_ID, firstName: 'App', lastName: 'Icant', profilePicture: null },
  opportunity: { id: OPP_ID, title: 'Software Engineer', companyName: 'Acme Corp' },
};

// ── createOpportunity ─────────────────────────────────────────────────────────

describe('opportunitiesService.createOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates and returns an opportunity', async () => {
    (mockPrisma.opportunity.create as jest.Mock).mockResolvedValue(mockOpportunity);

    const result = await opportunitiesService.createOpportunity(AUTHOR_ID, {
      title: 'Software Engineer',
      description: 'Great role',
      type: 'JOB',
      companyName: 'Acme Corp',
      location: 'Lagos',
      isRemote: false,
    });

    expect(result.id).toBe(OPP_ID);
    expect(mockPrisma.opportunity.create).toHaveBeenCalledTimes(1);
  });
});

// ── getOpportunities ──────────────────────────────────────────────────────────

describe('opportunitiesService.getOpportunities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated opportunities', async () => {
    (mockPrisma.opportunity.findMany as jest.Mock).mockResolvedValue([mockOpportunity]);

    const result = await opportunitiesService.getOpportunities({ limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('detects hasMore when rows exceed limit', async () => {
    const rows = [mockOpportunity, mockOpportunity, mockOpportunity];
    (mockPrisma.opportunity.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await opportunitiesService.getOpportunities({ limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});

// ── getOpportunity ────────────────────────────────────────────────────────────

describe('opportunitiesService.getOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue(mockOpportunity);

    const result = await opportunitiesService.getOpportunity(OPP_ID);
    expect(result.id).toBe(OPP_ID);
  });

  it('throws 404 for non-existent opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(opportunitiesService.getOpportunity(OPP_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── updateOpportunity ─────────────────────────────────────────────────────────

describe('opportunitiesService.updateOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates and returns the opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });
    (mockPrisma.opportunity.update as jest.Mock).mockResolvedValue({
      ...mockOpportunity,
      title: 'Updated Title',
    });

    const result = await opportunitiesService.updateOpportunity(OPP_ID, AUTHOR_ID, {
      title: 'Updated Title',
    });
    expect(result.title).toBe('Updated Title');
  });

  it('throws 403 when not the author', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });

    await expect(
      opportunitiesService.updateOpportunity(OPP_ID, 'stranger', { title: 'x' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 for non-existent opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      opportunitiesService.updateOpportunity(OPP_ID, AUTHOR_ID, { title: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── deleteOpportunity ─────────────────────────────────────────────────────────

describe('opportunitiesService.deleteOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });
    (mockPrisma.opportunity.delete as jest.Mock).mockResolvedValue({});

    await opportunitiesService.deleteOpportunity(OPP_ID, AUTHOR_ID);
    expect(mockPrisma.opportunity.delete).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when not the author', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });

    await expect(
      opportunitiesService.deleteOpportunity(OPP_ID, 'stranger'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── saveOpportunity ───────────────────────────────────────────────────────────

describe('opportunitiesService.saveOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves an opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ id: OPP_ID });
    (mockPrisma.savedOpportunity.upsert as jest.Mock).mockResolvedValue({});

    await opportunitiesService.saveOpportunity('user-1', OPP_ID);
    expect(mockPrisma.savedOpportunity.upsert).toHaveBeenCalledTimes(1);
  });

  it('throws 404 for non-existent opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(opportunitiesService.saveOpportunity('user-1', OPP_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── applyToOpportunity ────────────────────────────────────────────────────────

describe('opportunitiesService.applyToOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an application', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({
      id: OPP_ID,
      authorId: AUTHOR_ID,
    });
    (mockPrisma.opportunityApplication.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.opportunityApplication.create as jest.Mock).mockResolvedValue(mockApplication);

    const result = await opportunitiesService.applyToOpportunity(
      OPP_ID,
      APPLICANT_ID,
      { coverLetter: 'I am great' },
    );
    expect(result.id).toBe(APP_ID);
  });

  it('throws 400 when applying to own opportunity', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({
      id: OPP_ID,
      authorId: AUTHOR_ID,
    });

    await expect(
      opportunitiesService.applyToOpportunity(OPP_ID, AUTHOR_ID, {}),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 for duplicate application', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({
      id: OPP_ID,
      authorId: AUTHOR_ID,
    });
    (mockPrisma.opportunityApplication.findUnique as jest.Mock).mockResolvedValue(mockApplication);

    await expect(
      opportunitiesService.applyToOpportunity(OPP_ID, APPLICANT_ID, {}),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── getApplications ───────────────────────────────────────────────────────────

describe('opportunitiesService.getApplications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns applications for author', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });
    (mockPrisma.opportunityApplication.findMany as jest.Mock).mockResolvedValue([mockApplication]);

    const result = await opportunitiesService.getApplications(OPP_ID, AUTHOR_ID, { limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('throws 403 for non-author', async () => {
    (mockPrisma.opportunity.findUnique as jest.Mock).mockResolvedValue({ authorId: AUTHOR_ID });

    await expect(
      opportunitiesService.getApplications(OPP_ID, 'stranger', { limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── updateApplicationStatus ───────────────────────────────────────────────────

describe('opportunitiesService.updateApplicationStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the status', async () => {
    (mockPrisma.opportunityApplication.findUnique as jest.Mock).mockResolvedValue({
      ...mockApplication,
      opportunity: { authorId: AUTHOR_ID },
    });
    (mockPrisma.opportunityApplication.update as jest.Mock).mockResolvedValue({
      ...mockApplication,
      status: 'SHORTLISTED',
    });

    const result = await opportunitiesService.updateApplicationStatus(APP_ID, AUTHOR_ID, {
      status: 'SHORTLISTED',
    });
    expect(result.status).toBe('SHORTLISTED');
  });

  it('throws 403 for non-author', async () => {
    (mockPrisma.opportunityApplication.findUnique as jest.Mock).mockResolvedValue({
      ...mockApplication,
      opportunity: { authorId: AUTHOR_ID },
    });

    await expect(
      opportunitiesService.updateApplicationStatus(APP_ID, 'stranger', { status: 'REVIEWED' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when application does not exist', async () => {
    (mockPrisma.opportunityApplication.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      opportunitiesService.updateApplicationStatus(APP_ID, AUTHOR_ID, { status: 'REVIEWED' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── unsaveOpportunity ─────────────────────────────────────────────────────────

describe('opportunitiesService.unsaveOpportunity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes the saved record', async () => {
    (mockPrisma.savedOpportunity.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await opportunitiesService.unsaveOpportunity('user-1', OPP_ID);
    expect(mockPrisma.savedOpportunity.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', opportunityId: OPP_ID },
    });
  });
});

// ── getSavedOpportunities ─────────────────────────────────────────────────────

describe('opportunitiesService.getSavedOpportunities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated saved opportunities', async () => {
    (mockPrisma.savedOpportunity.findMany as jest.Mock).mockResolvedValue([
      { opportunity: mockOpportunity },
    ]);

    const result = await opportunitiesService.getSavedOpportunities('user-1', { limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('detects hasMore correctly', async () => {
    const rows = [
      { opportunity: mockOpportunity },
      { opportunity: mockOpportunity },
      { opportunity: mockOpportunity },
    ];
    (mockPrisma.savedOpportunity.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await opportunitiesService.getSavedOpportunities('user-1', { limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});

// ── getMyApplications ─────────────────────────────────────────────────────────

describe('opportunitiesService.getMyApplications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated applications for the requesting user', async () => {
    (mockPrisma.opportunityApplication.findMany as jest.Mock).mockResolvedValue([mockApplication]);

    const result = await opportunitiesService.getMyApplications(APPLICANT_ID, { limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items[0].id).toBe(APP_ID);
  });

  it('returns empty list when user has no applications', async () => {
    (mockPrisma.opportunityApplication.findMany as jest.Mock).mockResolvedValue([]);

    const result = await opportunitiesService.getMyApplications(APPLICANT_ID, { limit: 20 });
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});

// ── getMyOpportunities ────────────────────────────────────────────────────────

describe('opportunitiesService.getMyOpportunities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated opportunities authored by the user', async () => {
    (mockPrisma.opportunity.findMany as jest.Mock).mockResolvedValue([mockOpportunity]);

    const result = await opportunitiesService.getMyOpportunities(AUTHOR_ID, { limit: 20 });
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items[0].id).toBe(OPP_ID);
  });

  it('detects hasMore when rows exceed limit', async () => {
    const rows = Array(3).fill(mockOpportunity);
    (mockPrisma.opportunity.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await opportunitiesService.getMyOpportunities(AUTHOR_ID, { limit: 2 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
  });
});
