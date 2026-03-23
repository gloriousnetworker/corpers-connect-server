import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/errors';
import {
  CreateOpportunityDto,
  UpdateOpportunityDto,
  ListOpportunitiesDto,
  ApplyToOpportunityDto,
  UpdateApplicationStatusDto,
  ListApplicationsDto,
} from './opportunities.validation';

const OPPORTUNITY_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  companyName: true,
  location: true,
  isRemote: true,
  salary: true,
  deadline: true,
  requirements: true,
  contactEmail: true,
  companyWebsite: true,
  isFeatured: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, firstName: true, lastName: true, profilePicture: true },
  },
  _count: { select: { applications: true } },
};

export const opportunitiesService = {
  // ── Create ────────────────────────────────────────────────────────────────

  async createOpportunity(authorId: string, dto: CreateOpportunityDto) {
    return prisma.opportunity.create({
      data: {
        authorId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        companyName: dto.companyName,
        location: dto.location,
        isRemote: dto.isRemote ?? false,
        salary: dto.salary,
        deadline: dto.deadline,
        requirements: dto.requirements,
        contactEmail: dto.contactEmail,
        companyWebsite: dto.companyWebsite,
      },
      select: OPPORTUNITY_SELECT,
    });
  },

  // ── List (public feed) ────────────────────────────────────────────────────

  async getOpportunities(dto: ListOpportunitiesDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.opportunity.findMany({
      where: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.isRemote !== undefined ? { isRemote: dto.isRemote } : {}),
        ...(dto.search
          ? {
              OR: [
                { title: { contains: dto.search, mode: 'insensitive' } },
                { companyName: { contains: dto.search, mode: 'insensitive' } },
                { description: { contains: dto.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      select: OPPORTUNITY_SELECT,
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  // ── Single ────────────────────────────────────────────────────────────────

  async getOpportunity(id: string) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: OPPORTUNITY_SELECT,
    });
    if (!opportunity) throw new AppError('Opportunity not found', 404);
    return opportunity;
  },

  // ── My posted opportunities ───────────────────────────────────────────────

  async getMyOpportunities(authorId: string, dto: ListOpportunitiesDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.opportunity.findMany({
      where: { authorId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      select: OPPORTUNITY_SELECT,
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  // ── Update ────────────────────────────────────────────────────────────────

  async updateOpportunity(id: string, authorId: string, dto: UpdateOpportunityDto) {
    const existing = await prisma.opportunity.findUnique({ where: { id }, select: { authorId: true } });
    if (!existing) throw new AppError('Opportunity not found', 404);
    if (existing.authorId !== authorId) throw new AppError('Forbidden', 403);

    return prisma.opportunity.update({
      where: { id },
      data: dto,
      select: OPPORTUNITY_SELECT,
    });
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteOpportunity(id: string, authorId: string) {
    const existing = await prisma.opportunity.findUnique({ where: { id }, select: { authorId: true } });
    if (!existing) throw new AppError('Opportunity not found', 404);
    if (existing.authorId !== authorId) throw new AppError('Forbidden', 403);

    await prisma.opportunity.delete({ where: { id } });
  },

  // ── Save / Unsave ─────────────────────────────────────────────────────────

  async saveOpportunity(userId: string, opportunityId: string) {
    const opportunity = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true } });
    if (!opportunity) throw new AppError('Opportunity not found', 404);

    await prisma.savedOpportunity.upsert({
      where: { userId_opportunityId: { userId, opportunityId } },
      create: { userId, opportunityId },
      update: {},
    });
  },

  async unsaveOpportunity(userId: string, opportunityId: string) {
    await prisma.savedOpportunity.deleteMany({ where: { userId, opportunityId } });
  },

  async getSavedOpportunities(userId: string, dto: ListOpportunitiesDto) {
    const limit = dto.limit ?? 20;

    const rows = await prisma.savedOpportunity.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor
        ? { cursor: { userId_opportunityId: { userId, opportunityId: dto.cursor } }, skip: 1 }
        : {}),
      include: { opportunity: { select: OPPORTUNITY_SELECT } },
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => r.opportunity);
    return { items, hasMore };
  },

  // ── Apply ─────────────────────────────────────────────────────────────────

  async applyToOpportunity(
    opportunityId: string,
    applicantId: string,
    dto: ApplyToOpportunityDto,
    cvUrl?: string,
  ) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, authorId: true },
    });
    if (!opportunity) throw new AppError('Opportunity not found', 404);
    if (opportunity.authorId === applicantId)
      throw new AppError('You cannot apply to your own opportunity', 400);

    const existing = await prisma.opportunityApplication.findUnique({
      where: { opportunityId_applicantId: { opportunityId, applicantId } },
    });
    if (existing) throw new AppError('You have already applied to this opportunity', 409);

    return prisma.opportunityApplication.create({
      data: {
        opportunityId,
        applicantId,
        coverLetter: dto.coverLetter,
        cvUrl,
      },
      include: {
        applicant: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
        opportunity: { select: { id: true, title: true, companyName: true } },
      },
    });
  },

  // ── Applications for an opportunity (author view) ─────────────────────────

  async getApplications(opportunityId: string, authorId: string, dto: ListApplicationsDto) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { authorId: true },
    });
    if (!opportunity) throw new AppError('Opportunity not found', 404);
    if (opportunity.authorId !== authorId) throw new AppError('Forbidden', 403);

    const limit = dto.limit ?? 20;

    const items = await prisma.opportunityApplication.findMany({
      where: {
        opportunityId,
        ...(dto.status ? { status: dto.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      include: {
        applicant: { select: { id: true, firstName: true, lastName: true, profilePicture: true } },
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  // ── My applications (applicant view) ─────────────────────────────────────

  async getMyApplications(applicantId: string, dto: ListApplicationsDto) {
    const limit = dto.limit ?? 20;

    const items = await prisma.opportunityApplication.findMany({
      where: {
        applicantId,
        ...(dto.status ? { status: dto.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      include: {
        opportunity: { select: { id: true, title: true, companyName: true, type: true } },
      },
    });

    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  },

  // ── Update application status (author view) ───────────────────────────────

  async updateApplicationStatus(
    applicationId: string,
    authorId: string,
    dto: UpdateApplicationStatusDto,
  ) {
    const application = await prisma.opportunityApplication.findUnique({
      where: { id: applicationId },
      include: { opportunity: { select: { authorId: true } } },
    });
    if (!application) throw new AppError('Application not found', 404);
    if (application.opportunity.authorId !== authorId) throw new AppError('Forbidden', 403);

    return prisma.opportunityApplication.update({
      where: { id: applicationId },
      data: { status: dto.status },
      include: {
        applicant: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, title: true } },
      },
    });
  },
};
