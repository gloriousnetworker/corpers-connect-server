import { prisma } from '../../config/prisma';
import { NotFoundError, ForbiddenError } from '../../shared/utils/errors';
import { CampDayVisibility, CampMood } from '@prisma/client';
import { notificationsService } from '../notifications/notifications.service';
import type { UpsertCampDayDto } from './camp-experience.validation';

const TAGGED_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  isVerified: true,
} as const;

// Enrich a list of camp-day entries with full tagged-user objects so the client
// doesn't need to make N round-trips to render tag chips.
async function enrichWithTaggedUsers<T extends { taggedUserIds: string[] }>(entries: T[]) {
  const ids = Array.from(new Set(entries.flatMap((e) => e.taggedUserIds ?? [])));
  if (ids.length === 0) return entries.map((e) => ({ ...e, taggedUsers: [] }));
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: TAGGED_SELECT,
  });
  const map = new Map(users.map((u) => [u.id, u]));
  return entries.map((e) => ({
    ...e,
    taggedUsers: (e.taggedUserIds ?? [])
      .map((id) => map.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u),
  }));
}

export const campExperienceService = {
  /**
   * Create or update the caller's entry for a specific day (1..21).
   * Upserts on the (userId, dayNumber) unique key so the client can safely
   * PUT/POST the same day repeatedly and always get the same row.
   */
  async upsertDay(userId: string, dto: UpsertCampDayDto) {
    const taggedUserIds = Array.from(new Set(dto.taggedUserIds ?? [])).filter(
      (id) => id !== userId,
    );

    const existing = await prisma.campDayEntry.findUnique({
      where: { userId_dayNumber: { userId, dayNumber: dto.dayNumber } },
    });

    const data = {
      title: dto.title,
      story: dto.story,
      mood: dto.mood as CampMood | undefined,
      mediaUrls: dto.mediaUrls ?? [],
      taggedUserIds,
      isHighlight: dto.isHighlight ?? false,
      visibility: (dto.visibility ?? 'FRIENDS') as CampDayVisibility,
      campName: dto.campName,
      campState: dto.campState,
      entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
    };

    const entry = existing
      ? await prisma.campDayEntry.update({
          where: { userId_dayNumber: { userId, dayNumber: dto.dayNumber } },
          data,
        })
      : await prisma.campDayEntry.create({
          data: { ...data, userId, dayNumber: dto.dayNumber },
        });

    // Notify newly-tagged friends only (not on every edit)
    const previousTags = existing?.taggedUserIds ?? [];
    const newlyTagged = taggedUserIds.filter((id) => !previousTags.includes(id));
    for (const taggedId of newlyTagged) {
      void notificationsService.create({
        recipientId: taggedId,
        actorId: userId,
        type: 'MENTION',
        entityType: 'CampDay',
        entityId: entry.id,
        content: `tagged you in their Day ${entry.dayNumber} camp experience`,
      });
    }

    const [enriched] = await enrichWithTaggedUsers([entry]);
    return enriched;
  },

  /**
   * Fetch all 21 day-slots for a user. Slots without entries come back as
   * `null` so the UI can render the empty grid cells uniformly.
   *
   * Visibility rules when viewing someone else's diary:
   *   - PUBLIC  → anyone
   *   - FRIENDS → viewer must follow target
   *   - PRIVATE → owner only
   */
  async getUserDays(viewerId: string | undefined, targetUserId: string) {
    const isOwn = viewerId === targetUserId;

    let isFollowing = false;
    if (viewerId && !isOwn) {
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } },
      });
      isFollowing = !!follow;
    }

    const allowed: CampDayVisibility[] = isOwn
      ? ['PRIVATE', 'FRIENDS', 'PUBLIC']
      : isFollowing
        ? ['FRIENDS', 'PUBLIC']
        : ['PUBLIC'];

    const entries = await prisma.campDayEntry.findMany({
      where: { userId: targetUserId, visibility: { in: allowed } },
      orderBy: { dayNumber: 'asc' },
    });

    const enriched = await enrichWithTaggedUsers(entries);

    // Pad to 21 slots so UI can render a fixed grid regardless of density
    const byDay = new Map(enriched.map((e) => [e.dayNumber, e]));
    const slots = Array.from({ length: 21 }, (_, i) => {
      const day = i + 1;
      return byDay.get(day) ?? null;
    });

    return {
      days: slots,
      completedCount: entries.length,
      isOwn,
      canView: allowed.length > 0,
    };
  },

  async getDay(viewerId: string | undefined, targetUserId: string, dayNumber: number) {
    const entry = await prisma.campDayEntry.findUnique({
      where: { userId_dayNumber: { userId: targetUserId, dayNumber } },
    });
    if (!entry) throw new NotFoundError('Camp day not found');

    const isOwn = viewerId === targetUserId;
    if (!isOwn) {
      if (entry.visibility === 'PRIVATE') throw new NotFoundError('Camp day not found');
      if (entry.visibility === 'FRIENDS') {
        if (!viewerId) throw new NotFoundError('Camp day not found');
        const follow = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } },
        });
        if (!follow) throw new NotFoundError('Camp day not found');
      }
    }

    const [enriched] = await enrichWithTaggedUsers([entry]);
    return enriched;
  },

  async deleteDay(userId: string, dayNumber: number) {
    const entry = await prisma.campDayEntry.findUnique({
      where: { userId_dayNumber: { userId, dayNumber } },
    });
    if (!entry) throw new NotFoundError('Camp day not found');
    if (entry.userId !== userId) throw new ForbiddenError('Not your camp entry');

    await prisma.campDayEntry.delete({
      where: { userId_dayNumber: { userId, dayNumber } },
    });
  },
};
