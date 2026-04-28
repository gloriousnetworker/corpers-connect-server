import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../shared/utils/errors';
import { regionOf, statesInRegion, aliasStatesFor } from '../../shared/utils/regions';

const DEFAULT_LIMIT = 20;

/** Seed-time marker for the Corpers Connect official / state-official
 *  accounts — their state codes all start with "CC/OFFICIAL/" (see
 *  prisma/seed.ts). Real corpers have a standard NYSC state code, so this
 *  prefix is a reliable signal we can filter on without a schema change. */
const OFFICIAL_STATE_CODE_PREFIX = 'CC/OFFICIAL/';

const PUBLIC_SELECT = {
  id: true,
  stateCode: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  bio: true,
  level: true,
  isVerified: true,
  subscriptionTier: true,
  servingState: true,
  lga: true,
  ppa: true,
  batch: true,
  corperTag: true,
  corperTagLabel: true,
  // Drives the "B2B" marketer badge wherever a user identity is rendered.
  accountType: true,
  createdAt: true,
} as const;

type PublicUser = {
  id: string;
  // stateCode/servingState/batch are nullable on User (marketers have no NYSC
  // identity). Discover only surfaces CORPER accounts so these are normally
  // populated, but the type follows the DB so prisma `select` results assign.
  stateCode: string | null;
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  bio: string | null;
  level: string;
  isVerified: boolean;
  accountType: 'CORPER' | 'MARKETER';
  subscriptionTier: string;
  servingState: string | null;
  lga: string | null;
  ppa: string | null;
  batch: string | null;
  corperTag: boolean;
  corperTagLabel: string | null;
  createdAt: Date;
};

function isOfficialCode(stateCode: string | null | undefined): boolean {
  return !!stateCode && stateCode.startsWith(OFFICIAL_STATE_CODE_PREFIX);
}

/** Strip DB-only fields from the outgoing shape and attach the isOfficial flag. */
function toPublic(u: PublicUser) {
  const { stateCode, ...rest } = u;
  return { ...rest, isOfficial: isOfficialCode(stateCode) };
}

/** Gather the IDs this user has blocked or been blocked by. */
async function getBlockedIds(userId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
}

export const discoverService = {
  // ── Corpers in same state as the requesting user ──────────────────────────

  /**
   * Returns active users in the viewer's serving state. The viewer's own
   * state-official account (if it exists) is pinned at the top of the first
   * page; real corpers follow in recency order. FCT/Abuja aliases are
   * OR'd together so all three stored spellings match.
   */
  async getCorpersInState(userId: string, cursor?: string, limit = DEFAULT_LIMIT) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { servingState: true },
    });
    if (!me) throw new NotFoundError('User not found');

    const blockIds = await getBlockedIds(userId);
    const excludeIds = [...blockIds, userId];
    const stateAliases = aliasStatesFor(me.servingState);

    // Real corpers in this state (ordered newest-first)
    const realUsers = await prisma.user.findMany({
      where: {
        servingState: { in: stateAliases },
        isActive: true,
        id: { notIn: excludeIds },
        NOT: { stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX } },
      },
      select: PUBLIC_SELECT,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = realUsers.length > limit;
    const pageItems = hasMore ? realUsers.slice(0, limit) : realUsers;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1].id : null;

    // Pin the state's official account to the top of the first page only.
    let firstPageItems: PublicUser[] = pageItems;
    if (!cursor) {
      const official = await prisma.user.findFirst({
        where: {
          servingState: { in: stateAliases },
          isActive: true,
          id: { notIn: excludeIds },
          stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX },
        },
        select: PUBLIC_SELECT,
      });
      if (official) firstPageItems = [official, ...pageItems];
    }

    const userIds = firstPageItems.map((u) => u.id);
    const [followingSet, followsYouSet] = await Promise.all([
      prisma.follow
        .findMany({
          where: { followerId: userId, followingId: { in: userIds } },
          select: { followingId: true },
        })
        .then((rs) => new Set(rs.map((r) => r.followingId))),
      prisma.follow
        .findMany({
          where: { followerId: { in: userIds }, followingId: userId },
          select: { followerId: true },
        })
        .then((rs) => new Set(rs.map((r) => r.followerId))),
    ]);

    return {
      items: firstPageItems.map((u) => ({
        ...toPublic(u),
        isFollowing: followingSet.has(u.id),
        followsYou: followsYouSet.has(u.id),
      })),
      nextCursor,
      hasMore,
      state: me.servingState,
    };
  },

  // ── Follow suggestions (proximity-ranked) ─────────────────────────────────

  /**
   * Proximity-ranked follow suggestions. The goal is to connect corpers with
   * people close to them geographically, starting with the same serving
   * state and expanding outwards along the six Nigerian geopolitical zones.
   *
   * Order of tiers:
   *   1. Real corpers in the viewer's state
   *   2. Real corpers in the viewer's region (other states in the same zone)
   *   3. Real corpers elsewhere in Nigeria
   *   4. The viewer's own state-official account (if not already surfaced)
   *   5. Other state-official accounts — only to pad if nothing else fills
   *      the limit
   *
   * Tiers 4 and 5 intentionally sit below real users: the product's value
   * is corper-to-corper connection, and before this change the suggestions
   * list was dominated by state-official accounts (all marked isVerified,
   * which the old ordering sorted to the top).
   */
  async getSuggestions(userId: string, limit = DEFAULT_LIMIT) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { servingState: true },
    });
    if (!me) throw new NotFoundError('User not found');

    const [alreadyFollowing, blockIds] = await Promise.all([
      prisma.follow
        .findMany({ where: { followerId: userId }, select: { followingId: true } })
        .then((rs) => rs.map((r) => r.followingId)),
      getBlockedIds(userId),
    ]);

    const stateAliases = aliasStatesFor(me.servingState);
    const region = regionOf(me.servingState);
    const regionStates = region ? statesInRegion(region) : [];

    const exclude = new Set<string>([...alreadyFollowing, ...blockIds, userId]);
    const picked = new Map<string, PublicUser>();

    const pullTier = async (where: Prisma.UserWhereInput) => {
      if (picked.size >= limit) return;
      const remaining = limit - picked.size;
      const rows = await prisma.user.findMany({
        where: {
          ...where,
          isActive: true,
          id: { notIn: Array.from(exclude) },
        },
        select: PUBLIC_SELECT,
        take: remaining * 2, // overfetch to skip dupes cheaply
        orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
      });
      for (const u of rows) {
        if (picked.has(u.id)) continue;
        picked.set(u.id, u);
        exclude.add(u.id);
        if (picked.size >= limit) break;
      }
    };

    // Tier 1: real corpers in my state
    await pullTier({
      servingState: { in: stateAliases },
      NOT: { stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX } },
    });

    // Tier 2: real corpers in my region (other states)
    if (regionStates.length) {
      await pullTier({
        servingState: { in: regionStates, notIn: stateAliases },
        NOT: { stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX } },
      });
    }

    // Tier 3: real corpers anywhere else
    await pullTier({
      servingState: {
        notIn: regionStates.length ? [...regionStates, ...stateAliases] : stateAliases,
      },
      NOT: { stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX } },
    });

    // Tier 4: my state's official account
    await pullTier({
      servingState: { in: stateAliases },
      stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX },
    });

    // Tier 5 (last resort): any other official account
    await pullTier({
      stateCode: { startsWith: OFFICIAL_STATE_CODE_PREFIX },
    });

    const suggestions = Array.from(picked.values());
    const ids = suggestions.map((u) => u.id);

    const followsYouSet = await prisma.follow
      .findMany({
        where: { followerId: { in: ids }, followingId: userId },
        select: { followerId: true },
      })
      .then((rs) => new Set(rs.map((r) => r.followerId)));

    return suggestions.map((u) => ({
      ...toPublic(u),
      isFollowing: false,
      followsYou: followsYouSet.has(u.id),
    }));
  },

  // ── Search (name or state code) ────────────────────────────────────────────

  async search(
    requesterId: string | undefined,
    q: string,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ) {
    const blockIds = requesterId ? await getBlockedIds(requesterId) : [];

    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { notIn: [...blockIds, ...(requesterId ? [requesterId] : [])] },
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { stateCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_SELECT,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: [{ isVerified: 'desc' }, { firstName: 'asc' }],
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const [followingSet, followsYouSet] = await Promise.all([
      requesterId
        ? prisma.follow
            .findMany({
              where: { followerId: requesterId, followingId: { in: items.map((u) => u.id) } },
              select: { followingId: true },
            })
            .then((rs) => new Set(rs.map((r) => r.followingId)))
        : Promise.resolve(new Set<string>()),
      requesterId
        ? prisma.follow
            .findMany({
              where: { followerId: { in: items.map((u) => u.id) }, followingId: requesterId },
              select: { followerId: true },
            })
            .then((rs) => new Set(rs.map((r) => r.followerId)))
        : Promise.resolve(new Set<string>()),
    ]);

    return {
      items: items.map((u) => ({
        ...toPublic(u),
        isFollowing: followingSet.has(u.id),
        followsYou: followsYouSet.has(u.id),
      })),
      nextCursor,
      hasMore,
    };
  },
};
