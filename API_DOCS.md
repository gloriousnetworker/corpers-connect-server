# Corpers Connect — API Documentation

**Base URL (Production):** `https://corpers-connect-server-production.up.railway.app`
**Base URL (Local):** `http://localhost:5000`
**API Version:** v1
**All endpoints prefixed:** `/api/v1/`

---

## Authentication

All protected endpoints require a Bearer token:
```
Authorization: Bearer <accessToken>
```

Access tokens expire in **15 minutes**. Use the refresh endpoint to get a new pair.

---

## Response Format

All responses follow this envelope:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { ... }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description",
  "errors": { ... }   // present on 422 Validation errors
}
```

### HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized (no token / invalid token / revoked token) |
| 403 | Forbidden (insufficient role or blocked) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 422 | Validation Error (Zod schema failed) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Phase 1 — Auth Endpoints

### Health Check

```
GET /health
```
No auth required.

**Response:**
```json
{
  "status": "ok",
  "service": "Corpers Connect API",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2026-03-23T08:07:45.720Z"
}
```

---

### POST /api/v1/auth/lookup
Look up a corper's NYSC details by state code. Read-only — does not create an account.

**Rate limited:** 5 req/min per IP

**Body:**
```json
{ "stateCode": "KG/25C/1358" }
```

**Response 200:**
```json
{
  "data": {
    "stateCode": "KG/25C/1358",
    "firstName": "Iniubong",
    "lastName": "Udofot",
    "email": "udofotsx@yahoo.com",
    "phone": "08024983733",
    "servingState": "Kogi State",
    "ppa": "Mega Tech Solutions Lokoja",
    "batch": "2025C",
    "lga": "Lokoja",
    "alreadyRegistered": false
  }
}
```

**Errors:** `400` invalid format · `404` not found · `422` missing field

---

### POST /api/v1/auth/register/initiate
Step 1 of registration: submit state code + password. Sends OTP to NYSC-registered email.

**Body:**
```json
{
  "stateCode": "KG/25C/1359",
  "password": "Corper@1234",
  "confirmPassword": "Corper@1234"
}
```

**Password rules:** min 8 chars, uppercase, lowercase, number, special character.

**Response 200:**
```json
{
  "data": {
    "email": "chukwuemeriepascal@outlook.com",
    "maskedEmail": "ch***l@outlook.com",
    "message": "Verification code sent to your email",
    "devOtp": "123456"   // Only present when EXPOSE_DEV_OTP=true
  }
}
```

**Errors:** `409` already registered · `422` weak/mismatched password

---

### POST /api/v1/auth/register/verify
Step 2: verify OTP and create the account.

**Body:**
```json
{ "stateCode": "KG/25C/1359", "otp": "123456" }
```

**Response 201:**
```json
{
  "data": {
    "user": { "id": "...", "stateCode": "KG/25C/1359", "firstName": "Pascal", ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "sessionId": "..."
  }
}
```

**Errors:** `400` wrong OTP · `422` missing fields

---

### POST /api/v1/auth/login
Login with email or state code + password.

**Body:**
```json
{ "identifier": "KG/25C/1358", "password": "Corper@1234" }
// OR
{ "identifier": "udofotsx@yahoo.com", "password": "Corper@1234" }
```

**Response 200 (no 2FA):**
```json
{
  "data": {
    "requires2FA": false,
    "user": { ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Response 200 (2FA enabled):**
```json
{
  "data": {
    "requires2FA": true,
    "userId": "..."
  }
}
```

**Errors:** `401` invalid credentials · `422` missing fields

---

### POST /api/v1/auth/2fa/challenge
Complete 2FA login. Submit TOTP code returned from authenticator app.

**Body:**
```json
{ "userId": "...", "code": "123456" }
```

**Response 200:** Same as login without 2FA (returns tokens).

---

### POST /api/v1/auth/refresh
Refresh access token. Rotates both tokens (single-use refresh token).

**Body:**
```json
{ "refreshToken": "eyJ..." }
```

**Response 200:**
```json
{
  "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }
}
```

---

### POST /api/v1/auth/logout
**Auth required.** Revoke current session and blocklist the access token.

**Response 200:** `{ "message": "Logged out successfully" }`

---

### POST /api/v1/auth/forgot-password
Request a password reset OTP. Always returns 200 (no email enumeration).

**Body:**
```json
{ "email": "udofotsx@yahoo.com" }
```

**Response 200:**
```json
{
  "data": { "devOtp": "123456" }   // Only when EXPOSE_DEV_OTP=true
}
```

---

### POST /api/v1/auth/reset-password
Reset password using OTP from forgot-password.

**Body:**
```json
{
  "email": "udofotsx@yahoo.com",
  "otp": "123456",
  "newPassword": "NewCorper@5678",
  "confirmPassword": "NewCorper@5678"
}
```

**Response 200:** `{ "message": "Password reset successfully" }`

---

### PUT /api/v1/auth/change-password
**Auth required.** Change password (requires current password).

**Body:**
```json
{
  "currentPassword": "Corper@1234",
  "newPassword": "NewCorper@5678",
  "confirmPassword": "NewCorper@5678"
}
```

---

### POST /api/v1/auth/2fa/enable
**Auth required.** Initiate 2FA setup. Returns TOTP secret + QR code URI for authenticator app.

**Response 200:**
```json
{
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeDataUrl": "data:image/png;base64,..."
  }
}
```

---

### POST /api/v1/auth/2fa/verify-enable
**Auth required.** Confirm 2FA setup with code from authenticator. Activates 2FA permanently.

**Body:** `{ "code": "123456" }`

---

### POST /api/v1/auth/2fa/disable
**Auth required.** Disable 2FA (requires current TOTP code to confirm).

**Body:** `{ "code": "123456" }`

---

### GET /api/v1/auth/sessions
**Auth required.** List all active sessions for the authenticated user.

**Response 200:**
```json
{
  "data": [
    { "id": "...", "deviceInfo": "...", "ipAddress": "...", "createdAt": "..." }
  ]
}
```

---

### DELETE /api/v1/auth/sessions/:sessionId
**Auth required.** Revoke a specific session.

---

### DELETE /api/v1/auth/sessions
**Auth required.** Revoke all sessions except the current one.

---

## Phase 2 — User Profiles & Discovery

### GET /api/v1/users/me
**Auth required.** Returns the authenticated user's full profile + follow counts.

**Response 200:**
```json
{
  "data": {
    "id": "...",
    "stateCode": "KG/25C/1358",
    "firstName": "Iniubong",
    "lastName": "Udofot",
    "bio": "Testing bio update",
    "profilePicture": null,
    "corperTag": true,
    "corperTagLabel": "Dev Corper",
    "level": "OTONDO",
    "isVerified": false,
    "subscriptionTier": "FREE",
    "isOnboarded": true,
    "isFirstLogin": false,
    "twoFactorEnabled": false,
    "servingState": "Kogi State",
    "batch": "2025C",
    "followersCount": 0,
    "followingCount": 1
  }
}
```

---

### PATCH /api/v1/users/me
**Auth required.** Update profile fields.

**Body (all optional):**
```json
{
  "bio": "Your bio (max 160 chars)",
  "corperTag": true,
  "corperTagLabel": "Dev Corper (max 30 chars)"
}
```

---

### POST /api/v1/users/me/onboard
**Auth required.** Mark user as onboarded (sets `isOnboarded: true`, `isFirstLogin: false`).

**Body (all optional):**
```json
{ "bio": "...", "corperTag": true, "corperTagLabel": "..." }
```

---

### POST /api/v1/users/me/avatar
**Auth required.** Upload profile picture.

**Content-Type:** `multipart/form-data`
**Field name:** `avatar`
**Max size:** 5MB
**Accepted:** JPEG, PNG, WebP, GIF (images only)

Uploaded to Cloudinary, auto-resized to 400×400.

**Response 200:** Full updated user profile with new `profilePicture` URL.

---

### GET /api/v1/users/me/blocked
**Auth required.** Returns list of users blocked by the authenticated user.

**Response 200:**
```json
{
  "data": [
    { "id": "...", "firstName": "...", "lastName": "...", "profilePicture": null }
  ]
}
```

---

### GET /api/v1/users/:userId
**Auth optional.** Public profile view. Returns 404 if either party has blocked the other.

Contact info (email, phone) is not included on public profiles.

**Response 200:**
```json
{
  "data": {
    "id": "...",
    "firstName": "Pascal",
    "lastName": "Chukwuemerie",
    "profilePicture": null,
    "bio": null,
    "level": "OTONDO",
    "isVerified": false,
    "servingState": "Kogi State",
    "followersCount": 1,
    "followingCount": 0,
    "isFollowing": false   // always false when unauthenticated
  }
}
```

---

### POST /api/v1/users/:userId/follow
**Auth required.** Follow a user. Idempotent.

**Errors:** `400` cannot follow self · `403` blocked · `404` user not found

---

### DELETE /api/v1/users/:userId/follow
**Auth required.** Unfollow a user. Idempotent (no error if not following).

---

### GET /api/v1/users/:userId/followers
**Public.** Paginated list of users following `:userId`.

**Query:** `?cursor=<userId>&limit=20`

**Response 200:**
```json
{
  "data": {
    "items": [ { "id": "...", "firstName": "...", "lastName": "...", "profilePicture": null, "level": "OTONDO", "isVerified": false, "servingState": "Kogi State", "batch": "2025C" } ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

---

### GET /api/v1/users/:userId/following
**Public.** Paginated list of users `:userId` follows.

**Query:** `?cursor=<userId>&limit=20`

**Response 200:** Same shape as `/followers`.

---

### GET /api/v1/users/:userId/is-following
**Auth required.** Returns whether the authenticated user follows `:userId`.

**Response 200:**
```json
{ "data": { "isFollowing": true } }
```

---

### POST /api/v1/users/:userId/block
**Auth required.** Block a user. Also removes follow relationships in both directions.

**Errors:** `400` cannot block self · `404` user not found

---

### DELETE /api/v1/users/:userId/block
**Auth required.** Unblock a user.

---

### GET /api/v1/discover/corpers
**Auth required.** Returns corpers in the same serving state as the authenticated user. Excludes blocked users and self.

**Query:** `?cursor=<userId>&limit=20`

**Response 200:**
```json
{
  "data": {
    "items": [ { "id": "...", "firstName": "...", "servingState": "Kogi State", ... } ],
    "nextCursor": null,
    "hasMore": false,
    "state": "Kogi State"
  }
}
```

---

### GET /api/v1/discover/suggestions
**Auth required.** Follow suggestions — same state first (sorted by verified status), then any state. Excludes already-followed, blocked, and self.

**Query:** `?limit=20`

**Response 200:**
```json
{
  "data": [ { "id": "...", "firstName": "...", "isVerified": false, ... } ]
}
```

---

### GET /api/v1/discover/search
**Auth optional.** Search users by first name, last name, or state code (partial, case-insensitive). If authenticated, blocked users are excluded.

**Query:** `?q=Iniubong&cursor=<userId>&limit=20`

**Response 200:**
```json
{
  "data": {
    "items": [ { "id": "...", "firstName": "Iniubong", ... } ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

**Errors:** `422` missing `q` parameter

---

## Error Reference

### Validation Error (422)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "bio": ["Bio must be 160 characters or less"]
  }
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "message": "Too many attempts. Please wait a minute and try again."
}
```

---

## Pagination

Cursor-based pagination is used on list endpoints. Pass the `nextCursor` value as `cursor` on the next request.

```
GET /api/v1/users/:userId/followers?limit=20
→ { nextCursor: "user-id-xyz", hasMore: true }

GET /api/v1/users/:userId/followers?cursor=user-id-xyz&limit=20
→ next page
```

---

## Phase 3 — Social Feed

### Posts

#### Create Post
```
POST /api/v1/posts
Auth: Required
Body: { content?, mediaUrls?, visibility: "PUBLIC"|"STATE"|"FRIENDS"|"ONLY_ME", postType?: "REGULAR"|"REEL"|"OPPORTUNITY" }
```
- `content` OR `mediaUrls` is required (or both)
- `content` max 2000 chars; `mediaUrls` max 4 items
- Returns 201 with the created post

#### Get Post
```
GET /api/v1/posts/:postId
Auth: Optional
```
- Respects visibility rules (PUBLIC/STATE/FRIENDS/ONLY_ME)
- Auth users see `myReaction` field

#### Update Post
```
PATCH /api/v1/posts/:postId
Auth: Required (author only)
Body: { content?, mediaUrls?, visibility? }
```
- Only editable within **15 minutes** of creation. Returns 400 after window.

#### Delete Post
```
DELETE /api/v1/posts/:postId
Auth: Required (author only)
```

#### Report Post
```
POST /api/v1/posts/:postId/report
Auth: Required
Body: { reason: string (5–200 chars), details?: string }
```
- Cannot report your own post (400)

---

### Reactions

#### React to Post
```
POST /api/v1/posts/:postId/react
Auth: Required
Body: { type: "LIKE"|"LOVE"|"FIRE"|"CLAP"|"SAD"|"ANGRY" }
```
- Upserts — calling again with a different type changes the reaction

#### Remove Reaction
```
DELETE /api/v1/posts/:postId/react
Auth: Required
```

#### Get Reactions
```
GET /api/v1/posts/:postId/reactions?cursor=&limit=20
Auth: Not required
```

---

### Comments

#### Add Comment / Reply
```
POST /api/v1/posts/:postId/comments
Auth: Required
Body: { content: string, parentId?: string }
```
- `parentId` makes it a reply. Max 2 levels deep (reply-to-reply returns 400).

#### Delete Comment
```
DELETE /api/v1/posts/:postId/comments/:commentId
Auth: Required (comment author OR post owner)
```

#### List Comments
```
GET /api/v1/posts/:postId/comments?cursor=&limit=20
Auth: Not required
```
- Returns top-level comments with first **3 replies** each and `_count.replies`

---

### Bookmarks

#### Bookmark Post
```
POST /api/v1/posts/:postId/bookmark
Auth: Required
```

#### Remove Bookmark
```
DELETE /api/v1/posts/:postId/bookmark
Auth: Required
```

#### Get My Bookmarks
```
GET /api/v1/users/me/bookmarks?cursor=&limit=20
Auth: Required
```

---

### Feed

#### Home Feed
```
GET /api/v1/feed?cursor=&limit=20
Auth: Required
```
- Own posts + followed users' posts (respects visibility)
- Same-state users' PUBLIC/STATE posts
- Excludes flagged posts and blocked users
- Each post has `myReaction` field

---

### User Posts

#### Get User's Posts
```
GET /api/v1/users/:userId/posts?cursor=&limit=20
Auth: Optional
```
- Visibility filtered based on requester relationship (own / follower / same-state / public)

---

### Stories

#### Create Story
```
POST /api/v1/stories
Auth: Required
Content-Type: multipart/form-data
Fields: media (image or video, max 50MB), caption? (max 300 chars)
```
- Stories expire after **24 hours**

#### Get Stories Feed
```
GET /api/v1/stories
Auth: Required
```
- Returns stories from followed users + own stories
- Grouped by author with `hasUnviewed` flag
- Filters out expired stories

#### View a Story
```
POST /api/v1/stories/:storyId/view
Auth: Required
```
- Idempotent — calling twice is fine

#### Delete Story
```
DELETE /api/v1/stories/:storyId
Auth: Required (author only)
```

#### Add to Highlights
```
POST /api/v1/stories/:storyId/highlight
Auth: Required
Body: { title?: string (max 50 chars) }
```

#### Remove from Highlights
```
DELETE /api/v1/stories/:storyId/highlight
Auth: Required
```

#### Get User Highlights
```
GET /api/v1/stories/users/:userId/highlights
Auth: Not required
```
Also available at:
```
GET /api/v1/users/:userId/highlights
```

---

### Reels

#### Upload Reel
```
POST /api/v1/reels
Auth: Required
Content-Type: multipart/form-data
Fields: media (image or video, max 50MB), caption? (max 2000 chars), visibility?
```

#### Reels Feed (Following)
```
GET /api/v1/reels?cursor=&limit=20
Auth: Required
```
- Own reels + followed users' PUBLIC/FRIENDS reels

#### Explore Reels (Global)
```
GET /api/v1/reels/explore?cursor=&limit=20
Auth: Required
```
- All PUBLIC reels from anyone (excluding blocked users)

#### Get Single Reel
```
GET /api/v1/reels/:reelId
Auth: Not required
```

---

## Phase 4 — Real-Time Messaging

**Socket.IO connection:** `wss://corpers-connect-server-production.up.railway.app`

Connect with:
```js
import { io } from 'socket.io-client';
const socket = io(SERVER_URL, {
  auth: { token: '<accessToken>' },
  transports: ['websocket', 'polling'],
});
```

### REST Endpoints

#### Create / Get Conversation
```
POST /api/v1/conversations
Auth: Required
Body (DM):    { type: 'DM', participantId: string }
Body (Group): { type: 'GROUP', name: string, participantIds: string[], description? }
```
- DM creation is **idempotent** — returns existing conversation if it already exists
- Returns 201 with the conversation object

#### List My Conversations
```
GET /api/v1/conversations
Auth: Required
```
- Excludes archived conversations
- Each item includes last message + `unreadCount`

#### Get Conversation
```
GET /api/v1/conversations/:conversationId
Auth: Required (must be participant)
```

#### Update Group Conversation
```
PATCH /api/v1/conversations/:conversationId
Auth: Required (admin only)
Body: { name?, description?, picture? }
```

#### Update My Participation Settings
```
PATCH /api/v1/conversations/:conversationId/settings
Auth: Required
Body: { isArchived?, isPinned?, isMuted?, mutedUntil? }
```

#### Add Participants to Group
```
POST /api/v1/conversations/:conversationId/participants
Auth: Required (admin only)
Body: { userIds: string[] }
```

#### Leave Group
```
DELETE /api/v1/conversations/:conversationId/participants/me
Auth: Required
```

#### Remove Participant from Group
```
DELETE /api/v1/conversations/:conversationId/participants/:userId
Auth: Required (admin only)
```

---

#### Send Message
```
POST /api/v1/conversations/:conversationId/messages
Auth: Required (must be participant)
Body: { content?, type?: 'TEXT'|'IMAGE'|'AUDIO'|'VIDEO'|'FILE', mediaUrl?, replyToId? }
```
- `content` OR `mediaUrl` is required

#### Get Message History
```
GET /api/v1/conversations/:conversationId/messages?cursor=&limit=30
Auth: Required (must be participant)
```
- Returns newest first with cursor pagination

#### Edit Message
```
PATCH /api/v1/conversations/:conversationId/messages/:messageId
Auth: Required (sender only, text messages only)
Body: { content: string }
```

#### Delete Message
```
DELETE /api/v1/conversations/:conversationId/messages/:messageId?for=me|all
Auth: Required
```
- `?for=all` — soft-deletes content for all (sender only)
- `?for=me` (default) — hides from requester only

#### Mark Messages as Read
```
POST /api/v1/conversations/:conversationId/read
Auth: Required
Body: { messageIds: string[] }
```

---

### Socket.IO Events

#### Client → Server
| Event | Payload | Description |
|---|---|---|
| `conversation:join` | `conversationId: string` | Join a conversation room |
| `conversation:leave` | `conversationId: string` | Leave a room |
| `typing:start` | `{ conversationId }` | Notify others of typing |
| `typing:stop` | `{ conversationId }` | Stop typing indicator |
| `message:send` | `{ conversationId, content?, type?, mediaUrl?, replyToId? }` | Send message (persisted + broadcast) |
| `message:read` | `{ conversationId, messageIds: string[] }` | Mark messages as read |
| `ping:online` | — | Refresh online status TTL |

#### Server → Client
| Event | Payload | Description |
|---|---|---|
| `message:new` | full message object | New message in a conversation |
| `message:updated` | message object | Message was edited |
| `message:read` | `{ conversationId, userId, messageIds }` | Read receipt update |
| `typing:start` | `{ conversationId, userId }` | Someone started typing |
| `typing:stop` | `{ conversationId, userId }` | Someone stopped typing |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId }` | User went offline |
| `notification:new` | notification object | New notification for authenticated user |

---

## Phase 5 — Notifications

All endpoints require `Authorization: Bearer <token>`.

### FCM Token Registration

#### Register Device Token
```
POST /api/v1/users/me/fcm-token
Auth: Required
Body: { token: string }
```
- Idempotent — safe to call on every app launch
- Stores token in `User.fcmTokens` array

#### Remove Device Token
```
DELETE /api/v1/users/me/fcm-token
Auth: Required
Body: { token: string }
```
- Call on logout to stop push notifications on that device

---

### Notification Endpoints

#### List Notifications
```
GET /api/v1/notifications?cursor=&limit=20&unreadOnly=false
Auth: Required
```
- Returns cursor-paginated list, newest first
- `unreadOnly=true` filters to unread only
- Each notification includes `actor` (basic user info)

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "...",
        "type": "FOLLOW",
        "entityType": "User",
        "entityId": "...",
        "content": null,
        "isRead": false,
        "createdAt": "...",
        "actor": { "id": "...", "firstName": "...", "lastName": "...", "profilePicture": null }
      }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

#### Unread Count
```
GET /api/v1/notifications/unread-count
Auth: Required
```
**Response:** `{ "data": { "count": 3 } }`

#### Mark Specific Notifications as Read
```
POST /api/v1/notifications/read
Auth: Required
Body: { notificationIds: string[] }
```

#### Mark All as Read
```
POST /api/v1/notifications/read-all
Auth: Required
```

#### Delete Notification
```
DELETE /api/v1/notifications/:notificationId
Auth: Required (owner only)
```

---

### Notification Types

| Type | Triggered By | Socket Event |
|---|---|---|
| `FOLLOW` | Someone follows you | `notification:new` |
| `POST_LIKE` | Someone reacts to your post | `notification:new` |
| `POST_COMMENT` | Someone comments on your post | `notification:new` |
| `COMMENT_REPLY` | Someone replies to your comment | `notification:new` |
| `MENTION` | Someone @mentions you | `notification:new` |
| `DM_RECEIVED` | New message in a conversation | `notification:new` |
| `CALL_MISSED` | Missed call | `notification:new` |
| `STORY_VIEW` | Someone viewed your story | `notification:new` |
| `MARKET_INQUIRY` | New inquiry on your listing | `notification:new` |
| `LISTING_APPROVED` | Admin approved your listing | `notification:new` |
| `LISTING_REJECTED` | Admin rejected your listing | `notification:new` |
| `LEVEL_UP` | You levelled up | `notification:new` |
| `SYSTEM` | System message | `notification:new` |
| `BROADCAST` | Admin broadcast | `notification:new` |

---

## Phase 6 — Mami Market (Marketplace)

Base path: `/api/v1/marketplace`

### Enums

**ListingCategory**: `HOUSING` | `UNIFORM` | `ELECTRONICS` | `FOOD` | `SERVICES` | `OPPORTUNITIES` | `OTHERS`

**ListingType**: `FOR_SALE` | `FOR_RENT` | `SERVICE` | `FREE`

**ListingStatus**: `ACTIVE` | `SOLD` | `INACTIVE` | `REMOVED`

**SellerApplicationStatus**: `PENDING` | `APPROVED` | `REJECTED`

---

### Seller Applications

#### Apply as Seller
```
POST /api/v1/marketplace/apply
Auth: Required
Content-Type: multipart/form-data
Fields: idDoc (image file, max 10 MB)

Response 201:
{ status, userId, idDocUrl, createdAt }

Errors: 400 (no file), 409 (already pending/approved)
```

Re-application is allowed after a REJECTED status.

#### Get My Application Status
```
GET /api/v1/marketplace/my-application
Auth: Required

Response 200:
{ id, userId, idDocUrl, status, reviewNote, reviewedAt, createdAt }

Errors: 404 (no application submitted)
```

---

### Listings

#### Create Listing (Approved Sellers Only)
```
POST /api/v1/marketplace/listings
Auth: Required (must have APPROVED seller application)
Content-Type: multipart/form-data
Fields:
  images[]   — 1–5 image files (max 10 MB each)
  title      — 3–120 chars (required)
  description— 10–2000 chars (required)
  category   — ListingCategory (default: OTHERS)
  price      — positive number (optional for FREE/SERVICE)
  listingType— ListingType (default: FOR_SALE)
  location   — string max 200 (optional)

Response 201:
{ id, title, description, category, price, listingType, location, images[], servingState, status, seller }

Errors: 400 (no images, validation), 403 (not approved seller)
```

#### Browse Listings
```
GET /api/v1/marketplace/listings
Auth: Optional (filters out blocked users' listings when authed)
Query:
  category    — ListingCategory filter
  listingType — ListingType filter
  state       — servingState filter
  search      — text search in title/description
  minPrice    — minimum price filter
  maxPrice    — maximum price filter
  cursor      — cursor-based pagination
  limit       — items per page (default: 20, max: 50)

Response 200:
{ items: Listing[], nextCursor, hasMore }
```
Boosted listings appear first (`isBoost: true`).

#### Get Single Listing
```
GET /api/v1/marketplace/listings/:listingId
Auth: Optional

Response 200:
{ id, title, description, images[], price, category, listingType, location, servingState,
  status, viewCount, isBoost, createdAt, seller, _count: { inquiries } }

Errors: 404 (not found, flagged, or blocked)
```
Increments `viewCount` on every fetch (fire-and-forget).

#### Get My Listings
```
GET /api/v1/marketplace/my-listings
Auth: Required
Query: cursor, limit

Response 200:
{ items: Listing[], nextCursor, hasMore }
```
Returns listings in all statuses (ACTIVE, SOLD, INACTIVE).

#### Update Listing
```
PATCH /api/v1/marketplace/listings/:listingId
Auth: Required (owner only)
Body (JSON):
  title, description, category, price, listingType, location — all optional
  status — ACTIVE | SOLD | INACTIVE

Response 200: Updated listing object
Errors: 403 (not owner), 404 (not found)
```

#### Delete Listing
```
DELETE /api/v1/marketplace/listings/:listingId
Auth: Required (owner only)

Response 200: { data: null }
Errors: 403 (not owner), 404 (not found)
```

---

### Inquiries

#### Inquire About a Listing
```
POST /api/v1/marketplace/listings/:listingId/inquire
Auth: Required

Response 201:
{ inquiry: { id, listingId, buyerId, createdAt }, listingTitle, sellerId }

Errors:
  400 — seller cannot inquire on own listing
  400 — listing not ACTIVE
  404 — listing not found
```
Idempotent — repeated calls return the same inquiry record.
Triggers a `MARKET_INQUIRY` notification to the seller.

#### Get Listing Inquiries (Seller Only)
```
GET /api/v1/marketplace/listings/:listingId/inquiries
Auth: Required (listing owner only)
Query: cursor, limit

Response 200:
{ items: [{ id, listingId, buyerId, createdAt, buyer: UserSummary }], nextCursor, hasMore }

Errors: 403 (not owner), 404 (not found)
```

---

## Phase 7 — Voice & Video Calls (Agora)

Base path: `/api/v1/calls`

Calls use a dual-channel approach: **REST** for initiating calls and querying history, **Socket.IO** for real-time call signaling.

### Agora RTC Token

Tokens are generated server-side via `agora-access-token`:
- Caller UID = `1`, Receiver UID = `2`
- Token expiry = 1 hour (`/calls/:callId/token` for refresh)
- Channel name = auto-generated UUID stored in `CallLog.agoraChannelName`
- When `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` are not configured, dev placeholder tokens are returned

---

### REST Endpoints

#### Initiate Call (REST fallback)
```
POST /api/v1/calls
Auth: Required
Body: { receiverId: string, type: 'VOICE'|'VIDEO' }

Response 201:
{
  callLog: { id, callerId, receiverId, type, status: 'RINGING', agoraChannelName, ... },
  callerToken: string,
  receiverToken: string,
  channelName: string,
  appId: string
}

Errors: 400 (self-call), 403 (blocked), 404 (receiver not found), 422 (validation)
```
> Primary path is via Socket.IO `call:initiate` event. REST is for fallback/testing.

#### Get Call History
```
GET /api/v1/calls
Auth: Required
Query: cursor, limit (default 20), type? ('VOICE'|'VIDEO')

Response 200:
{ items: CallLog[], nextCursor, hasMore }
```
Returns calls where the user is either the caller or the receiver, newest first.

#### Get Single Call
```
GET /api/v1/calls/:callId
Auth: Required (must be a participant)

Response 200: CallLog with caller + receiver summaries
Errors: 403 (non-participant), 404
```

#### Accept Call
```
PATCH /api/v1/calls/:callId/accept
Auth: Required (receiver only)

Response 200:
{ callLog: { ...status: 'ACTIVE', startedAt }, token, channelName, appId }

Errors: 400 (not RINGING), 403 (not receiver), 404
```

#### Reject Call
```
PATCH /api/v1/calls/:callId/reject
Auth: Required (receiver only)

Response 200: CallLog with status: 'REJECTED'
Errors: 400 (not RINGING), 403 (not receiver), 404
```

#### End Call
```
PATCH /api/v1/calls/:callId/end
Auth: Required (either participant)

Response 200: CallLog with status: 'ENDED', endedAt, duration (seconds)
Errors: 400 (already ended), 403 (non-participant), 404
```

#### Mark as Missed
```
PATCH /api/v1/calls/:callId/miss
Auth: Required (either participant)

Response 200: CallLog with status: 'MISSED'
Side effect: sends CALL_MISSED notification to the receiver
```

#### Refresh Agora Token
```
GET /api/v1/calls/:callId/token
Auth: Required (must be a participant)

Response 200: { token, channelName, appId }
Errors: 400 (call ended/rejected), 403 (non-participant), 404
```

---

### Socket.IO Events

All socket events require JWT authentication. Connect to the server with `Authorization: Bearer <token>` or `auth.token`.

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `call:initiate` | `{ receiverId, type? }` | Start a new call |
| `call:accept` | `{ callId }` | Accept incoming call |
| `call:reject` | `{ callId }` | Reject incoming call |
| `call:end` | `{ callId }` | End active call |
| `call:no-answer` | `{ callId }` | Timeout — mark as missed |
| `call:busy` | `{ callId }` | Receiver is busy (rejects + notifies busy) |

All events accept an optional acknowledgement callback: `(result: { success, data?, error? }) => void`

#### Server → Client

| Event | Payload | Sent To |
|---|---|---|
| `call:incoming` | `{ callId, callerId, caller, type, channelName, token, appId }` | Receiver's personal room |
| `call:initiated` | `{ callId, channelName, token, appId }` | Caller (ack) |
| `call:accepted` | `{ callId, channelName, token, appId }` | Caller's personal room |
| `call:rejected` | `{ callId }` | Caller's personal room |
| `call:ended` | `{ callId, duration }` | Other party's personal room |
| `call:missed` | `{ callId }` | Receiver's personal room |
| `call:busy` | `{ callId }` | Caller's personal room |
| `call:error` | `{ callId?, message }` | Emitter only |

#### Example Call Flow

```
Caller emits:  call:initiate { receiverId, type: 'VIDEO' }
Server →       call:incoming (to receiver's room) + call:initiated ack to caller

Receiver emits: call:accept { callId }
Server →        call:accepted (to caller's room)

Both join Agora channel using their respective tokens.

Caller emits:  call:end { callId }
Server →       call:ended { callId, duration } (to receiver's room)
```

---

### CallLog Object

```json
{
  "id": "cuid",
  "callerId": "user-id",
  "receiverId": "user-id",
  "type": "VOICE" | "VIDEO",
  "status": "RINGING" | "ACTIVE" | "ENDED" | "REJECTED" | "MISSED" | "FAILED",
  "agoraChannelName": "call-abc123",
  "startedAt": "ISO8601 | null",
  "endedAt": "ISO8601 | null",
  "duration": 42,
  "createdAt": "ISO8601",
  "caller": { "id", "firstName", "lastName", "profilePicture", "isVerified" },
  "receiver": { "id", "firstName", "lastName", "profilePicture", "isVerified" }
}
```

---

## Phase 8 — Opportunities Module

Base path: `/api/v1/opportunities`
All endpoints require authentication.

---

### POST /opportunities
Create a new opportunity posting.

**Body (JSON):**
```json
{
  "title": "Backend Developer",
  "description": "Build APIs for millions of NYSC corpers",
  "type": "JOB",
  "companyName": "Tech Ltd",
  "location": "Abuja",
  "isRemote": true,
  "salary": "300,000 – 500,000 NGN/month",
  "deadline": "2026-06-01T00:00:00Z",
  "requirements": "3+ years Node.js experience",
  "contactEmail": "jobs@techltd.com",
  "companyWebsite": "https://techltd.com"
}
```
`type`: `JOB | INTERNSHIP | VOLUNTEER | CONTRACT | OTHER`

**Response 201:**
```json
{ "status": "success", "data": { ...OpportunityObject } }
```

---

### GET /opportunities
Paginated opportunity feed with optional filters.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `cursor` | string | Pagination cursor (opportunity ID) |
| `limit` | number | Items per page (1–50, default 20) |
| `type` | string | Filter by `OpportunityType` |
| `isRemote` | boolean | `true` / `false` |
| `search` | string | Search title, company, description |

**Response 200:**
```json
{ "status": "success", "data": { "items": [...], "hasMore": false } }
```

---

### GET /opportunities/mine
List opportunities posted by the authenticated user.

**Query params:** Same as `GET /opportunities` (cursor, limit)

---

### GET /opportunities/saved
List opportunities the authenticated user has saved.

---

### GET /opportunities/applications/mine
List all applications submitted by the authenticated user.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `cursor` | string | Pagination cursor |
| `limit` | number | Default 20 |
| `status` | string | Filter by `ApplicationStatus` |

---

### GET /opportunities/:opportunityId
Get a single opportunity by ID.

**Response 200:**
```json
{ "status": "success", "data": { ...OpportunityObject } }
```
**Errors:** `404 Not Found`

---

### PATCH /opportunities/:opportunityId
Update an opportunity. Author only. Partial update supported.

**Body (JSON, all optional):** Same fields as create.

**Errors:** `403 Forbidden`, `404 Not Found`

---

### DELETE /opportunities/:opportunityId
Delete an opportunity and all its applications. Author only.

**Response:** `204 No Content`

**Errors:** `403 Forbidden`, `404 Not Found`

---

### POST /opportunities/:opportunityId/save
Save/bookmark an opportunity.

**Response 200:**
```json
{ "status": "success", "data": null, "message": "Opportunity saved" }
```

---

### DELETE /opportunities/:opportunityId/save
Unsave/remove bookmark for an opportunity.

---

### POST /opportunities/:opportunityId/apply
Submit an application. Optionally upload a CV file.

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `coverLetter` | string (optional) | Cover letter (10–5000 chars) |
| `cv` | file (optional) | PDF, DOC, or DOCX, max 5 MB |

**Response 201:**
```json
{
  "status": "success",
  "data": {
    "id": "app-cuid",
    "opportunityId": "opp-cuid",
    "applicantId": "user-cuid",
    "coverLetter": "...",
    "cvUrl": "https://res.cloudinary.com/...",
    "status": "PENDING",
    "applicant": { "id", "firstName", "lastName", "profilePicture" },
    "opportunity": { "id", "title", "companyName" }
  }
}
```

**Errors:** `400` (own opportunity), `404` (not found), `409` (duplicate application)

---

### GET /opportunities/:opportunityId/applications
List all applications for an opportunity. Author only.

**Query params:** `cursor`, `limit`, `status` (filter by ApplicationStatus)

**Response 200:**
```json
{ "status": "success", "data": { "items": [...ApplicationObject], "hasMore": false } }
```

**Errors:** `403 Forbidden`, `404 Not Found`

---

### PATCH /opportunities/applications/:applicationId/status
Update an application's status. Opportunity author only.

**Body:**
```json
{ "status": "SHORTLISTED" }
```
`status`: `PENDING | REVIEWED | SHORTLISTED | ACCEPTED | REJECTED`

**Response 200:**
```json
{ "status": "success", "data": { ...ApplicationObject } }
```

**Errors:** `403 Forbidden`, `404 Not Found`, `422 Unprocessable Entity`

---

### Opportunity Object

```json
{
  "id": "cuid",
  "title": "Backend Developer",
  "description": "...",
  "type": "JOB",
  "companyName": "Tech Ltd",
  "location": "Abuja",
  "isRemote": true,
  "salary": "300k – 500k NGN/month",
  "deadline": "2026-06-01T00:00:00Z",
  "requirements": "...",
  "contactEmail": "jobs@techltd.com",
  "companyWebsite": "https://techltd.com",
  "isFeatured": false,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "author": { "id", "firstName", "lastName", "profilePicture" },
  "_count": { "applications": 12 }
}
```

---

## Phase 9 — Subscriptions & Level Progression

Base path: `/api/v1/subscriptions`

---

### GET /subscriptions/plans
Returns available subscription plans. **No authentication required.**

**Response 200:**
```json
{
  "status": "success",
  "data": [
    { "key": "MONTHLY", "label": "Corper Plus Monthly", "amountKobo": 150000, "amountNaira": 1500, "durationDays": 30 },
    { "key": "ANNUAL", "label": "Corper Plus Annual", "amountKobo": 1400000, "amountNaira": 14000, "durationDays": 365 }
  ]
}
```

---

### POST /subscriptions/initialize
Initialize a Paystack transaction. Returns a redirect URL for the user to complete payment.

**Body:**
```json
{ "plan": "MONTHLY", "callbackUrl": "https://myapp.com/payment/callback" }
```
`plan`: `MONTHLY | ANNUAL`. `callbackUrl` is optional (defaults to CLIENT_URL).

**Response 201:**
```json
{
  "status": "success",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/xxx",
    "accessCode": "xxx",
    "reference": "cc-abc123-1234567890",
    "plan": "MONTHLY",
    "amountKobo": 150000,
    "amountNaira": 1500
  }
}
```
**Errors:** `409` (already subscribed), `422` (invalid plan), `502` (Paystack error)

---

### GET /subscriptions/verify?reference=xxx
Verify a completed payment by reference. Called after Paystack redirect.

**Query:** `reference` (required)

**Response 200:** Returns the activated `Subscription` object.

**Errors:** `400` (payment failed/not found), `403` (payment belongs to another user), `422` (missing reference)

---

### POST /subscriptions/webhook
Paystack webhook endpoint — called automatically by Paystack on `charge.success`.
**No authentication.** Signature verified via `x-paystack-signature` HMAC-SHA512.

**Headers:** `x-paystack-signature: <hmac-sha512-of-body>`

**Response 200:** `{ "received": true }`

**Errors:** `400` (missing signature), `401` (invalid signature)

---

### GET /subscriptions/me
Get the current authenticated user's active subscription.

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "id": "cuid",
    "userId": "user-id",
    "tier": "PREMIUM",
    "plan": "MONTHLY",
    "amountKobo": 150000,
    "startDate": "ISO8601",
    "endDate": "ISO8601",
    "status": "ACTIVE",
    "paystackRef": "cc-xxx-1234"
  }
}
```
Returns `data: null` when no active subscription. Auto-expires subscriptions past `endDate`.

---

### GET /subscriptions/history
Get all subscriptions (active, expired, cancelled) for the authenticated user.

**Response 200:** Array of Subscription objects.

---

### POST /subscriptions/cancel
Cancel the current active subscription. Downgrade user tier to `FREE` and re-evaluate level.

**Response 200:** Returns the cancelled Subscription object.

**Errors:** `404` (no active subscription)

---

### GET /subscriptions/level
Get current level info and next level requirements.

**Response 200:**
```json
{
  "status": "success",
  "data": {
    "currentLevel": "KOPA",
    "subscriptionTier": "FREE",
    "accountAgeDays": 45,
    "nextLevel": {
      "level": "CORPER",
      "requirements": [
        { "label": "Active Corper Plus subscription", "met": false }
      ]
    }
  }
}
```
`currentLevel`: `OTONDO | KOPA | CORPER`. `nextLevel` is `null` for `CORPER`.

**Level Rules:**
| Level | Condition |
|---|---|
| OTONDO | Default (new user) |
| KOPA | Account 30+ days old AND email verified |
| CORPER | Active PREMIUM subscription |

---

### POST /subscriptions/level/check
Re-evaluate and update the authenticated user's level based on current state.

**Response 200:**
```json
{ "status": "success", "data": { "id": "user-id", "level": "KOPA", "subscriptionTier": "FREE" } }
```

---

## Phase 10 — Admin APIs

> All routes prefixed: `/api/v1/admin`
> Admin JWT uses same Bearer token format. Regular user tokens are rejected with 403.

### POST /admin/auth/login

Public endpoint — no token required.

**Request:**
```json
{ "email": "admin@example.com", "password": "Admin@1234" }
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "accessToken": "<jwt>",
    "admin": { "id": "...", "email": "...", "firstName": "...", "lastName": "...", "role": "SUPERADMIN" }
  }
}
```

---

### GET /admin/dashboard

**Auth:** Admin

**Response:**
```json
{
  "status": "success",
  "data": {
    "totalUsers": 1234,
    "activeUsers": 1100,
    "premiumUsers": 200,
    "totalPosts": 5678,
    "pendingReports": 12,
    "pendingSellerApps": 5,
    "activeSubscriptions": 190
  }
}
```

---

### GET /admin/users

**Auth:** Admin | **Query:** `limit`, `cursor`, `search`, `servingState`, `level`, `subscriptionTier`, `isActive`, `isVerified`

**Response:** `{ items: [...], hasMore: boolean }`

---

### GET /admin/users/:userId

**Auth:** Admin

Returns full user profile with post/follower counts.

---

### PATCH /admin/users/:userId/suspend

**Auth:** Admin | **Body:** `{ reason?: string }`

Returns 400 if already suspended.

---

### PATCH /admin/users/:userId/reactivate

**Auth:** Admin

Returns 400 if already active.

---

### PATCH /admin/users/:userId/verify

**Auth:** Admin

Marks `isVerified: true`.

---

### DELETE /admin/users/:userId

**Auth:** Admin | **Response:** 204 No Content

---

### POST /admin/users/:userId/subscription

**Auth:** Admin | **Body:** `{ plan: "MONTHLY" | "ANNUAL" }`

Grants PREMIUM subscription with no charge (amountKobo = 0). Cancels any existing active subscription first.

---

### DELETE /admin/users/:userId/subscription

**Auth:** Admin

Revokes active subscription, downgrades user to FREE tier. Returns 404 if no active subscription.

---

### GET /admin/reports

**Auth:** Admin | **Query:** `limit`, `cursor`, `status` (PENDING|ACTIONED|DISMISSED), `entityType`

**Response:** `{ items: [...], hasMore: boolean }`

---

### GET /admin/reports/:reportId

**Auth:** Admin

Returns report with reporter details.

---

### PATCH /admin/reports/:reportId

**Auth:** Admin | **Body:** `{ status: "ACTIONED" | "DISMISSED", reviewNote?: string }`

---

### GET /admin/seller-applications

**Auth:** Admin | **Query:** `limit`, `cursor`, `status` (PENDING|APPROVED|REJECTED)

**Response:** `{ items: [...], hasMore: boolean }`

---

### PATCH /admin/seller-applications/:appId/approve

**Auth:** Admin | **Body:** `{ reviewNote?: string }`

Returns 400 if not PENDING.

---

### PATCH /admin/seller-applications/:appId/reject

**Auth:** Admin | **Body:** `{ reviewNote?: string }`

Returns 400 if not PENDING.

---

### GET /admin/settings

**Auth:** Admin

Returns all system settings ordered by key.

---

### PUT /admin/settings/:key

**Auth:** Admin | **Body:** `{ value: <any non-undefined JSON> }`

Creates or updates a setting. Key is the URL parameter.

```json
{ "status": "success", "data": { "key": "maintenance_mode", "value": true } }
```

---

### GET /admin/audit-logs

**Auth:** Admin | **Query:** `cursor`, `limit` (default 20)

Returns paginated audit log entries with admin user details.

---

### GET /admin/admins

**Auth:** SuperAdmin only (403 for regular Admin)

Returns list of all admin users.

---

### POST /admin/admins

**Auth:** SuperAdmin only | **Body:** `{ email, password, firstName, lastName, role: "ADMIN"|"SUPERADMIN" }`

Returns 409 if email already in use.

**Response:** 201
```json
{ "status": "success", "data": { "id": "...", "email": "...", "role": "ADMIN", "createdAt": "..." } }
```

---

### PATCH /admin/admins/:adminId/deactivate

**Auth:** SuperAdmin only

Returns 400 if trying to deactivate yourself or if admin is already inactive.

---

## Phase Status

| Phase | Status | Endpoints |
|---|---|---|
| Phase 1 — Auth | ✅ Complete | `/auth/*` |
| Phase 2 — Profiles & Discovery | ✅ Complete | `/users/*`, `/discover/*` |
| Phase 3 — Social Feed | ✅ Complete | `/posts/*`, `/feed`, `/stories/*`, `/reels/*` |
| Phase 4 — Messaging | ✅ Complete | `/conversations/*` (Socket.IO) |
| Phase 5 — Notifications | ✅ Complete | `/notifications/*` |
| Phase 6 — Mami Market | ✅ Complete | `/marketplace/*` |
| Phase 7 — Calls | ✅ Complete | `/calls/*` (Agora) |
| Phase 8 — Opportunities | ✅ Complete | `/opportunities/*` |
| Phase 9 — Subscriptions | ✅ Complete | `/subscriptions/*` (Paystack) |
| Phase 10 — Admin | ✅ Complete | `/admin/*` |
| Phase 11 — Background Jobs | ✅ Complete | BullMQ (email, subscription, level, cleanup) |
