# Corpers Connect — Full Codebase Audit

**Audited:** 2026-04-03  
**Repos audited:** `corpers-connect-backend`, `corpers-connect-users`, `corpers-connect-admin`  
**Total issues:** 46

Legend: ✅ Fixed | 🔄 In Progress | ⬜ Open

---

## CRITICAL (Must fix before launch)

| # | Repo | Issue | Status |
|---|---|---|---|
| 1 | backend | `.env` committed to git — all secrets exposed. Rotate every key, scrub git history with BFG. | ✅ FALSE POSITIVE — `.env` is gitignored and was never committed. Only `.env.example` is in history. |
| 2 | backend | Paystack webhook does not verify `x-paystack-signature` HMAC. No idempotency key — duplicate `charge.success` events create duplicate subscriptions. | ✅ FALSE POSITIVE — `handleWebhook()` verifies HMAC via `crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY)` (subscriptions.service.ts:133–138) and checks `findFirst({ where: { paystackRef: reference } })` before creating any subscription (subscriptions.service.ts:151–154). Raw body captured in `app.ts`. |
| 3 | backend | XSS in email templates — user names interpolated raw into HTML (`Hello <strong>${name}</strong>`). Must HTML-escape all user inputs before rendering in email. | ✅ Fixed — commit 50fc1b0 |
| 4 | backend | Socket.IO has no rate limiting on events. Any socket can spam `message:send`, `call:initiate`, `typing:start` — DoS vector. | ✅ Fixed — commit a4cabb9 |
| 5 | backend | Socket `message:send` does not verify sender is a participant of the target conversation. Any authenticated user can write into any conversation by ID. | ✅ FALSE POSITIVE — `sendMessage()` calls `assertParticipant()` at service entry (messaging.service.ts:244) which throws 403 if user is not a member. |
| 6 | backend | `call:initiate` does not check if receiver has blocked the caller. Blocked users can still ring their blocker. | ✅ FALSE POSITIVE — `initiateCall()` runs `prisma.block.findFirst` (calls.service.ts:63–71) in both directions and throws ForbiddenError if any block exists. |
| 7 | users | Refresh token stored in `localStorage` (`cc_refresh_token`) — XSS-accessible. Needs migration to `httpOnly` cookie (requires backend change). | ✅ Fixed — backend commit f5ff2c1 · users commit 07fb505 |
| 8 | admin | Admin JWT stored in `localStorage` (`cc_admin_token`) — same XSS risk as #7 but higher blast radius. | ✅ Fixed — backend commit f5ff2c1 · admin commit 241034c |

---

## HIGH PRIORITY

| # | Repo | Issue | Status |
|---|---|---|---|
| 9 | backend | No `process.on('unhandledRejection')` or `process.on('uncaughtException')` handlers in `server.ts`. Silent async failures crash the Railway server without logging. | ✅ Fixed — commit 864d915 |
| 10 | backend | Email never re-verified after registration. Email is trusted from NYSC lookup but users can change it without proof of ownership. | ✅ Fixed — backend commit 0f1efff · users commit 6f061ae |
| 11 | backend | OTP email sent synchronously in registration flow — blocks the request. Must be queued via BullMQ. | ✅ Fixed — commit a594805 |
| 12 | backend | No rate limiting on 2FA TOTP challenge attempts. Attacker with a valid challenge token has unlimited tries on 6-digit code. | ✅ Fixed — commit c2a109d |
| 13 | backend | Paystack test keys (`sk_test_...`) active in `.env`. Live `sk_live_...` keys required before real transactions. | ⬜ |
| 14 | users | No Content Security Policy headers in `next.config.mjs`. Without CSP the browser won't block injected scripts, amplifying the localStorage token risk. | ✅ Fixed — commit 4aad8af |
| 15 | admin | Railway API URL hardcoded in three separate files (`client.ts`, proxy route, `next.config.mjs`). Must be unified into `NEXT_PUBLIC_API_URL` env var. | ✅ Fixed — commit 8f4e025 |
| 16 | admin | Dashboard charts always render empty — `getDashboard()` returns hardcoded empty arrays for `userGrowth`, `revenue`, `contentActivity`. Backend must return real time-series data. | ✅ Fixed — backend commit 5f6d122 · admin commit a012f37 |
| 17 | admin | Middleware checks only that `cc_admin_session=1` cookie *exists*, not that it's valid. Anyone can set that cookie manually and bypass the route guard. | ✅ Fixed — commit 34767e1 |

---

## MEDIUM PRIORITY

| # | Repo | Issue | Status |
|---|---|---|---|
| 18 | backend | All Socket.IO events share one namespace. Messaging, calls, and notifications should be split into `/messaging`, `/calls`, `/notifications`. | ✅ Fixed — backend commit b9bc9cd · users commit d8fc664 |
| 19 | backend | Deleted Cloudinary files not cleaned up. Deleting an avatar or listing does not call `cloudinary.uploader.destroy()`. | ✅ Fixed — backend commit 4fa4b64 |
| 20 | backend | Multi-step operations (subscription + audit log, etc.) run as separate queries. Partial failures leave the DB in an inconsistent state. Wrap in `prisma.$transaction()`. | ✅ Fixed — commit e1f72cd |
| 21 | backend | Marketplace listing creation does not check `seller.status == APPROVED` at the service layer. The schema has no FK constraint enforcing this either. | ✅ FALSE POSITIVE — `createListing()` calls `assertApprovedSeller()` (marketplace.service.ts:68) which throws 403 if status != APPROVED. `updateListing` and `deleteListing` use `assertListingOwner()`. |
| 22 | backend | No request correlation IDs. Impossible to trace a request through logs when errors occur in production. | ✅ Fixed — commit 4796605 |
| 23 | backend | Comment reply depth not enforced. Schema allows infinite nesting via `parentId`. Must cap at 1 level in the service layer. | ✅ FALSE POSITIVE — `addComment()` checks `if (parent.parentId) throw BadRequestError` (posts.service.ts:309). Max 2 levels enforced. |
| 24 | users | Socket disconnect is invisible to the user. No "Reconnecting…" banner shown when network drops. | ✅ Fixed — commit e853a0e |
| 25 | users | Token refresh has no timeout. If `/auth/refresh` hangs, all queued requests hang indefinitely. | ✅ Fixed — commit 1103a37 |
| 26 | users | Profile page has no posts grid. Core profile feature missing. | ✅ Fixed — users commit 049c6e1 |
| 27 | users | No search within conversations. High-demand messaging feature. | ✅ Fixed — backend commit bcdbbdd · users commit 8e974b6 |
| 28 | users | Marketplace has no reviews/ratings system. Primary trust signal missing for buyers and sellers. | ✅ Fixed — backend commit 5630472 · users commit b0344bb |
| 29 | admin | `hydrate()` called in both `Providers.tsx` and `AdminLayout.tsx`. Causes 3 test failures and double-execution on every page load. | ✅ Fixed — commit c3cdfd3 |
| 30 | admin | `DataTable` `SkeletonRow` renders a `<tbody>` inside the parent `<tbody>` — invalid HTML, causes 2 test failures. Must render `<tr>` elements only. | ✅ Fixed — commit c3cdfd3 |
| 31 | admin | `401` response uses `window.location.replace('/login')` — causes full page reload and loses unsaved data. Must use Next.js router. | ✅ Fixed — commit cb1750a |

---

## LOW PRIORITY

| # | Repo | Issue | Status |
|---|---|---|---|
| 32 | backend | No subscription auto-renewal job. Users must manually re-purchase when plan expires. | ✅ Fixed — backend commit 7cba8b7 (daily cron at 03:00, Paystack charge_authorization, renewal email on success/failure) |
| 33 | backend | `morgan` may log tokens appearing in query params. Add a sanitizer to strip sensitive values. | ✅ Fixed — backend commit 2d32884 |
| 34 | backend | No Jest coverage threshold. Any coverage (including 0%) passes the test run. | ✅ Fixed — backend commit 2d32884 |
| 35 | backend | Posts permanently deleted — no `isDeleted` soft-delete flag or audit trail for admin review. | ✅ Fixed — backend commit 8cbd8fc (isDeleted + deletedAt on Post, soft-delete in deletePost(), all public queries filter isDeleted: false) |
| 36 | backend | N+1 queries in visibility and follow/block checks. Each request re-fetches follow and block status separately. | ✅ Fixed — backend commit d2b9644 (Promise.all batches follow/block/viewer lookups in feed, getPost, getUserPosts) |
| 37 | users | App works in offline PWA mode but shows no offline indicator to the user. | ✅ Fixed — users commit bda0c67 (OfflineBanner component mounted in AppShell, uses online/offline window events) |
| 38 | users | Some components use raw Next.js `<Image>` without Cloudinary transform URL params. | ✅ Fixed — users commit 66bfd42 (10 components updated to use getOptimisedUrl / getAvatarUrl) |
| 39 | users | `CreatePostModal` is not dynamically imported — loads unconditionally with the feed on every render. | ✅ Fixed — users commit 56cc946 |
| 40 | users | Icon-only buttons missing `aria-label` attributes throughout (BottomNav, toolbar buttons). | ✅ FALSE POSITIVE — BottomNav links use `aria-label` on every icon-only anchor; toolbar icon buttons include visible text labels. |
| 41 | users | Share post counts are tracked by the backend but there is no share UI on the frontend. | ✅ FALSE POSITIVE — Share button with `navigator.share` / clipboard fallback present in `PostCard`; count displayed inline. |
| 42 | admin | Sidebar collapsed state resets on every page reload — not persisted to localStorage. | ✅ Fixed — admin commit (zustand `persist` middleware with key `cc-admin-ui`) |
| 43 | admin | Login page ignores the `?next` redirect parameter — always navigates to `/dashboard` after login. | ✅ Fixed — admin commit (reads `?next` via `useSearchParams`, validates relative-path-only to prevent open redirect) |
| 44 | admin | No logout API call — token is not blacklisted server-side when the admin signs out. | ✅ FALSE POSITIVE — `adminLogout()` API call already present in `useAdminAuth.ts` logout handler. |
| 45 | admin | No error boundary on admin pages — an uncaught render error silently breaks the whole page. | ✅ FALSE POSITIVE — `src/app/(admin)/error.tsx` is Next.js App Router's built-in error boundary with UI + reset button. |
| 46 | admin | Admin accounts have no 2FA. High-privilege accounts should require MFA. | ✅ Fixed — backend commit 565467c · admin commit 1ca7202 (TOTP setup/disable on /security page, login challenge step, 5-attempt brute-force guard) |

---

## Fix Order (Recommended)

1. **Issues 1–6** — Backend security & socket integrity (no user data / money at risk until these are done)
2. **Issues 7–8** — Token storage migration (coordinate users + admin + backend together)
3. **Issues 9–13** — Server stability + payment safety
4. **Issues 14–17** — Frontend security + admin health
5. **Issues 18–31** — Feature completeness and correctness
6. **Issues 32–46** — Polish, performance, nice-to-haves
