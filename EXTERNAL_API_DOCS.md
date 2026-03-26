# Corpers Connect — External API Documentation

> **Version:** v1.0
> **Base URL:** `https://your-domain.com/api/v1`
> **Protocol:** HTTPS only
> **Format:** JSON (UTF-8)

---

## Overview

The Corpers Connect API is a RESTful API built for third-party developers to integrate with the Corpers Connect platform — a social community for Nigerian NYSC corps members.

**Available to third-party integrators:**
- User profile lookups
- Social graph (follow/follower data)
- Public content (posts, reels, stories)
- Marketplace listings
- Opportunities board
- Subscription plan info

**Not exposed externally:**
- Admin panel endpoints
- Messaging/conversations
- Background job triggers
- Webhook management

---

## Access & Pricing

Access to the Corpers Connect API is gated by an API tier system. Contact **api@corpers-connect.com** to apply for access.

| Tier | Rate Limit | Endpoints | Monthly Fee |
|---|---|---|---|
| **Free (Sandbox)** | 100 req/day | Auth + Public read endpoints | Free |
| **Starter** | 1,000 req/hour | All user-facing read endpoints | ₦5,000/month |
| **Growth** | 10,000 req/hour | All user-facing endpoints (read + write) | ₦20,000/month |
| **Enterprise** | Unlimited (SLA) | All endpoints + dedicated support | Custom |

Upon approval, you receive a **Client ID** and **Client Secret** for OAuth2 authentication.

---

## Authentication

Corpers Connect uses **JWT Bearer token** authentication for all protected endpoints.

### Getting an Access Token

To act on behalf of a user, direct them through the OAuth2 Authorization Code flow (coming soon), or use the standard login endpoint if you are building a first-party integration.

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "identifier": "AB/23A/1234",
  "password": "user-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": {
      "id": "clxyz123",
      "firstName": "John",
      "lastName": "Doe",
      "level": "KOPA"
    }
  }
}
```

### Using the Token

Include the access token in every request:

```http
Authorization: Bearer <accessToken>
```

### Refreshing Tokens

Access tokens expire in **15 minutes**. Refresh tokens expire in **30 days** (single-use rotation).

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

---

## Response Format

All responses follow a consistent envelope format:

### Success Response
```json
{
  "success": true,
  "message": "Optional message",
  "data": { ... }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "nextCursor": "clxyz456",
    "hasMore": true
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": [
    { "field": "email", "message": "Invalid email address" }
  ]
}
```

---

## Error Codes

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | BAD_REQUEST | Invalid request body or parameters |
| 401 | UNAUTHORIZED | Missing or invalid access token |
| 403 | FORBIDDEN | Valid token but insufficient permissions |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Resource already exists (e.g. duplicate follow) |
| 422 | VALIDATION_ERROR | Request body failed schema validation |
| 429 | TOO_MANY_REQUESTS | Rate limit exceeded |
| 500 | SERVER_ERROR | Internal server error |

---

## Rate Limiting

Rate limits are applied per IP address (unauthenticated) and per user (authenticated).

**Default limits:**
- Global: 100 requests per 15 minutes per IP
- Auth endpoints: 10 requests per 15 minutes per IP

When rate limited, the response includes:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735000000
```

---

## Pagination

All list endpoints use **cursor-based pagination** for consistency and performance.

### Request
```http
GET /api/v1/feed?limit=20&cursor=clxyz123
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 20 | Number of results (max 50) |
| `cursor` | string | — | Cursor from previous response's `nextCursor` |

### Response
```json
{
  "data": {
    "items": [ ... ],
    "nextCursor": "clxyz456",
    "hasMore": true
  }
}
```

Pass `nextCursor` as `cursor` in the next request to get the next page. When `hasMore` is `false`, you've reached the end.

---

## Data Types & Enums

### User Level
| Level | Description |
|---|---|
| `OTONDO` | Newly registered (< 30 days, free tier) |
| `KOPA` | Active corps member (30+ days, email verified, free tier) |
| `CORPER` | Premium subscriber |

### Post Visibility
| Value | Description |
|---|---|
| `PUBLIC` | Visible to everyone |
| `FOLLOWERS` | Visible to followers only |
| `PRIVATE` | Visible to the author only |

### Reaction Types
`LIKE` | `LOVE` | `FIRE` | `CLAP`

### Opportunity Types
`JOB` | `INTERNSHIP` | `VOLUNTEER` | `GIG` | `OTHER`

### Application Status
`PENDING` | `ACCEPTED` | `REJECTED` | `WITHDRAWN`

### Subscription Plans
| Plan | Price | Duration |
|---|---|---|
| `MONTHLY` | ₦1,500 | 30 days |
| `ANNUAL` | ₦14,000 | 365 days |

### Listing Category
`ELECTRONICS` | `FASHION` | `FOOD` | `SERVICES` | `OTHER`

### Listing Type
`SALE` | `RENT` | `SERVICE`

### Call Type
`AUDIO` | `VIDEO`

---

## API Reference

### Authentication

#### Look Up a Corper

Returns NYSC data for a state code. Useful to verify a corps member before onboarding them.

```http
POST /api/v1/auth/lookup
```

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `stateCode` | string | ✓ | NYSC state code (e.g. `AB/23A/1234`) |

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "stateCode": "AB/23A/1234",
    "firstName": "John",
    "lastName": "Doe",
    "servingState": "Lagos",
    "batchYear": 2023,
    "email": "j***@gmail.com"
  }
}
```

---

#### Register (Two-Step)

**Step 1 — Initiate:**
```http
POST /api/v1/auth/register/initiate
```

| Field | Type | Required | Description |
|---|---|---|---|
| `stateCode` | string | ✓ | NYSC state code |
| `password` | string | ✓ | Min 8 chars, must include uppercase, number, special char |

Returns `otpToken` — a short-lived JWT identifying the pending registration session.

**Step 2 — Verify OTP:**
```http
POST /api/v1/auth/register/verify
```

| Field | Type | Required | Description |
|---|---|---|---|
| `otpToken` | string | ✓ | Token from Step 1 |
| `otp` | string | ✓ | 6-digit OTP sent to NYSC-registered email |

Returns `accessToken`, `refreshToken`, and `user` object.

---

#### Login

```http
POST /api/v1/auth/login
```

| Field | Type | Required | Description |
|---|---|---|---|
| `identifier` | string | ✓ | Email or NYSC state code |
| `password` | string | ✓ | User password |

Returns tokens or a `challengeToken` if 2FA is enabled.

---

#### Refresh Token

```http
POST /api/v1/auth/refresh
```

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | ✓ |

Returns new `accessToken` and `refreshToken`. Old refresh token is invalidated.

---

### Users

#### Get My Profile

```http
GET /api/v1/users/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clxyz123",
    "firstName": "John",
    "lastName": "Doe",
    "stateCode": "AB/23A/1234",
    "servingState": "Lagos",
    "bio": "Corps member at Lagos State",
    "avatarUrl": "https://...",
    "level": "KOPA",
    "subscriptionTier": "FREE",
    "isVerified": false,
    "isOnboarded": true,
    "followersCount": 42,
    "followingCount": 18,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

#### Get User Profile (Public)

```http
GET /api/v1/users/:userId
Authorization: Bearer <token>   (optional)
```

Returns a sanitized public profile. Returns `404` if either party has blocked the other.

---

#### Follow a User

```http
POST /api/v1/users/:userId/follow
Authorization: Bearer <token>
```

Idempotent — calling twice does not create duplicate follows.

**Response `200 OK`:**
```json
{ "success": true, "message": "Followed successfully" }
```

---

#### Unfollow a User

```http
DELETE /api/v1/users/:userId/follow
Authorization: Bearer <token>
```

---

#### Get Followers

```http
GET /api/v1/users/:userId/followers?limit=20&cursor=<cursor>
```

Public endpoint. Cursor-paginated list of followers.

---

#### Get Following

```http
GET /api/v1/users/:userId/following?limit=20&cursor=<cursor>
```

---

#### Check Follow Status

```http
GET /api/v1/users/:userId/is-following
Authorization: Bearer <token>
```

**Response:**
```json
{ "success": true, "data": { "isFollowing": true } }
```

---

#### Block / Unblock

```http
POST   /api/v1/users/:userId/block    # Block
DELETE /api/v1/users/:userId/block    # Unblock
Authorization: Bearer <token>
```

Blocking removes all existing follow relationships between both users.

---

#### Upload Avatar

```http
POST /api/v1/users/me/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Constraints |
|---|---|---|
| `avatar` | file | Image only, max 5MB |

---

### Discover

#### Corpers in My State

```http
GET /api/v1/discover/corpers?limit=20&cursor=<cursor>
Authorization: Bearer <token>
```

Returns corps members currently serving in the same state as the authenticated user.

---

#### Follow Suggestions

```http
GET /api/v1/discover/suggestions?limit=10
Authorization: Bearer <token>
```

Returns suggested users to follow (prioritizes same state).

---

#### Search Users

```http
GET /api/v1/discover/search?q=john&limit=20&cursor=<cursor>
Authorization: Bearer <token>   (optional)
```

| Parameter | Description |
|---|---|
| `q` | Search term (name or state code) |

---

### Posts

#### Create Post

```http
POST /api/v1/posts
Authorization: Bearer <token>
Content-Type: application/json
```

| Field | Type | Required | Description |
|---|---|---|---|
| `content` | string | ✓* | Post text (*required if no mediaUrls) |
| `mediaUrls` | string[] | ✓* | Array of media URLs (*required if no content) |
| `visibility` | string | — | `PUBLIC` (default) \| `FOLLOWERS` \| `PRIVATE` |

---

#### Get Post

```http
GET /api/v1/posts/:postId
Authorization: Bearer <token>   (optional)
```

Returns `403` if the post visibility rules prevent access.

---

#### Update Post

```http
PATCH /api/v1/posts/:postId
Authorization: Bearer <token>
```

Only the post author can edit. Editing is only allowed within **15 minutes** of creation.

---

#### Delete Post

```http
DELETE /api/v1/posts/:postId
Authorization: Bearer <token>
```

Only the post author can delete.

---

#### React to Post

```http
POST /api/v1/posts/:postId/react
Authorization: Bearer <token>
```

```json
{ "reaction": "LIKE" }
```

Calling again with a different reaction type updates the existing reaction. One reaction per user per post.

---

#### Remove Reaction

```http
DELETE /api/v1/posts/:postId/react
Authorization: Bearer <token>
```

---

#### Comments

```http
POST /api/v1/posts/:postId/comments     # Add comment
GET  /api/v1/posts/:postId/comments     # List comments (public)
DELETE /api/v1/posts/:postId/comments/:commentId  # Delete comment
```

Add reply by passing `parentId` in the request body. Maximum nesting depth: **2 levels**.

---

#### Bookmarks

```http
POST   /api/v1/posts/:postId/bookmark   # Bookmark
DELETE /api/v1/posts/:postId/bookmark   # Remove bookmark
GET    /api/v1/users/me/bookmarks       # List bookmarks
Authorization: Bearer <token>
```

---

### Feed

#### Home Feed

```http
GET /api/v1/feed?limit=20&cursor=<cursor>
Authorization: Bearer <token>
```

Returns posts from: the authenticated user, their followees, and public posts from the same serving state. Ordered by most recent.

---

### Stories

```http
POST /api/v1/stories                    # Upload story (multipart)
GET  /api/v1/stories                    # Stories feed
POST /api/v1/stories/:storyId/view      # Mark as viewed
DELETE /api/v1/stories/:storyId         # Delete own story
POST /api/v1/stories/:storyId/highlight # Add to highlights
DELETE /api/v1/stories/:storyId/highlight # Remove from highlights
GET /api/v1/stories/users/:userId/highlights # User's highlights (public)
```

Stories automatically expire after **24 hours**. Highlighted stories are permanent.

Upload story via `multipart/form-data` with field `media` (image or video).

---

### Reels

```http
POST /api/v1/reels             # Upload reel (multipart, requires auth)
GET  /api/v1/reels             # Following feed (requires auth)
GET  /api/v1/reels/explore     # Public explore feed (requires auth)
GET  /api/v1/reels/:reelId     # Single reel (public)
```

Upload reel via `multipart/form-data` with field `media`.

---

### Marketplace

#### Browse Listings

```http
GET /api/v1/marketplace/listings
Authorization: Bearer <token>   (optional)
```

| Query Param | Description |
|---|---|
| `category` | `ELECTRONICS` \| `FASHION` \| `FOOD` \| `SERVICES` \| `OTHER` |
| `listingType` | `SALE` \| `RENT` \| `SERVICE` |
| `state` | Filter by serving state |
| `search` | Full-text search |
| `minPrice` | Minimum price in kobo |
| `maxPrice` | Maximum price in kobo |
| `cursor` | Pagination cursor |
| `limit` | Results per page (default 20, max 50) |

---

#### Get Listing

```http
GET /api/v1/marketplace/listings/:listingId
Authorization: Bearer <token>   (optional)
```

Increments `viewCount` on each request.

---

#### Submit Seller Application

```http
POST /api/v1/marketplace/apply
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Description |
|---|---|---|
| `idDoc` | file | Government-issued ID (image) |
| `businessName` | string | Optional business name |

---

#### Create Listing (Approved Sellers Only)

```http
POST /api/v1/marketplace/listings
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|---|---|---|---|
| `images` | file[] | ✓ | Product images |
| `title` | string | ✓ | Listing title |
| `description` | string | ✓ | Listing description |
| `price` | number | ✓ | Price in kobo (₦1 = 100 kobo) |
| `category` | string | ✓ | Category enum |
| `listingType` | string | ✓ | SALE \| RENT \| SERVICE |
| `condition` | string | — | NEW \| USED |

---

#### Inquire About Listing

```http
POST /api/v1/marketplace/listings/:listingId/inquire
Authorization: Bearer <token>
```

```json
{ "message": "Is this still available?" }
```

Creates an inquiry and opens a conversation thread with the seller.

---

### Opportunities

#### Get Opportunities Feed

```http
GET /api/v1/opportunities?limit=20&cursor=<cursor>
Authorization: Bearer <token>
```

| Query Param | Description |
|---|---|
| `type` | `JOB` \| `INTERNSHIP` \| `VOLUNTEER` \| `GIG` \| `OTHER` |
| `search` | Full-text search |

---

#### Create Opportunity

```http
POST /api/v1/opportunities
Authorization: Bearer <token>
Content-Type: application/json
```

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✓ | Opportunity title |
| `description` | string | ✓ | Full description |
| `type` | string | ✓ | Opportunity type enum |
| `location` | string | — | Location string |
| `isRemote` | boolean | — | Remote work option |
| `deadline` | datetime | — | Application deadline (ISO 8601) |

---

#### Apply to Opportunity

```http
POST /api/v1/opportunities/:opportunityId/apply
Authorization: Bearer <token>
Content-Type: application/json
```

| Field | Type | Description |
|---|---|---|
| `coverLetter` | string | Optional cover letter |

---

#### Update Application Status (Opportunity Owner)

```http
PATCH /api/v1/opportunities/applications/:applicationId/status
Authorization: Bearer <token>
```

```json
{ "status": "ACCEPTED" }
```

Status values: `PENDING` | `ACCEPTED` | `REJECTED` | `WITHDRAWN`

---

### Subscriptions

#### Get Plans

```http
GET /api/v1/subscriptions/plans
```

Public endpoint. Returns available subscription plans with pricing.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "MONTHLY",
      "name": "Monthly Plan",
      "price": 150000,
      "priceFormatted": "₦1,500",
      "currency": "NGN",
      "durationDays": 30,
      "features": ["Premium content", "Marketplace selling", "CORPER badge"]
    },
    {
      "id": "ANNUAL",
      "name": "Annual Plan",
      "price": 1400000,
      "priceFormatted": "₦14,000",
      "currency": "NGN",
      "durationDays": 365,
      "savings": "₦4,000 vs monthly",
      "features": ["All Monthly features", "Priority support"]
    }
  ]
}
```

---

#### Initialize Payment

```http
POST /api/v1/subscriptions/initialize
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{ "plan": "MONTHLY" }
```

Returns a Paystack checkout URL. Redirect the user to this URL to complete payment.

**Response:**
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "accessCode": "...",
    "reference": "corpers-connect-ref-123"
  }
}
```

---

#### Verify Payment

```http
GET /api/v1/subscriptions/verify?reference=<paystackRef>
Authorization: Bearer <token>
```

Call after user returns from Paystack checkout. Activates subscription on success.

---

#### Get Current Subscription

```http
GET /api/v1/subscriptions/me
Authorization: Bearer <token>
```

---

#### Cancel Subscription

```http
POST /api/v1/subscriptions/cancel
Authorization: Bearer <token>
```

Cancels auto-renewal. Subscription remains active until `endDate`.

---

### Notifications

```http
GET  /api/v1/notifications                          # List (cursor-paginated)
GET  /api/v1/notifications/unread-count             # Unread count
POST /api/v1/notifications/read                     # Mark specific as read
POST /api/v1/notifications/read-all                 # Mark all as read
DELETE /api/v1/notifications/:notificationId        # Delete one
Authorization: Bearer <token>
```

**Notification Types:**
| Type | Trigger |
|---|---|
| `FOLLOW` | Someone followed you |
| `REACT` | Someone reacted to your post |
| `COMMENT` | Someone commented on your post |
| `REPLY` | Someone replied to your comment |
| `MENTION` | You were mentioned in a post |
| `CALL` | Incoming call |
| `MESSAGE` | New message |
| `OPPORTUNITY_APPLICATION` | Someone applied to your opportunity |

---

### Calls (Agora RTC)

Calls use Agora RTC for audio/video. The server provides tokens and channel info; the client connects directly via Agora SDK.

#### Initiate Call

```http
POST /api/v1/calls
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "receiverId": "user-id",
  "type": "AUDIO"
}
```

**Response includes:**
- `callLog`: Call record with ID and status
- `token`: Agora RTC token for caller
- `channel`: Agora channel name
- `uid`: Caller's Agora UID

---

```http
PATCH /api/v1/calls/:callId/accept   # Accept (receiver)
PATCH /api/v1/calls/:callId/reject   # Reject (receiver)
PATCH /api/v1/calls/:callId/end      # End (either party)
PATCH /api/v1/calls/:callId/miss     # Mark missed
GET   /api/v1/calls/:callId/token    # Refresh Agora token
GET   /api/v1/calls                  # Call history
GET   /api/v1/calls/:callId          # Call details
Authorization: Bearer <token>
```

---

## WebSocket / Real-Time Events

Real-time features (messages, notifications, calls) are delivered via **Socket.IO**.

**Connection:**
```javascript
import { io } from 'socket.io-client';

const socket = io('https://your-domain.com', {
  auth: { token: accessToken }
});
```

**Events emitted by server:**

| Event | Payload | Description |
|---|---|---|
| `new_message` | `{ conversationId, message }` | New message in a conversation |
| `message_updated` | `{ conversationId, message }` | Message edited |
| `message_deleted` | `{ conversationId, messageId }` | Message deleted |
| `new_notification` | `{ notification }` | New notification |
| `call_initiated` | `{ callId, caller, type }` | Incoming call |
| `call_accepted` | `{ callId, token, channel }` | Call accepted |
| `call_rejected` | `{ callId }` | Call rejected |
| `call_ended` | `{ callId }` | Call ended |
| `user_typing` | `{ conversationId, userId }` | User is typing |

**Events emitted by client:**

| Event | Payload | Description |
|---|---|---|
| `join_conversation` | `{ conversationId }` | Subscribe to conversation |
| `leave_conversation` | `{ conversationId }` | Unsubscribe |
| `typing_start` | `{ conversationId }` | Notify typing start |
| `typing_stop` | `{ conversationId }` | Notify typing stop |

---

## Paystack Webhook Integration

If you are processing payments on behalf of your users, configure a Paystack webhook pointing to:

```
POST https://your-domain.com/api/v1/subscriptions/webhook
```

Paystack sends a HMAC-SHA512 signature in the `x-paystack-signature` header. The server verifies this automatically.

**Supported events:**
- `charge.success` — Payment successful, subscription activated

---

## SDK Examples

### JavaScript / TypeScript

```typescript
const BASE_URL = 'https://your-domain.com/api/v1';

// Login
const loginRes = await fetch(`${BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'AB/23A/1234', password: 'password' })
});
const { data: { accessToken, refreshToken } } = await loginRes.json();

// Get feed
const feedRes = await fetch(`${BASE_URL}/feed?limit=20`, {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
const { data: { items, nextCursor } } = await feedRes.json();
```

### Python

```python
import requests

BASE_URL = 'https://your-domain.com/api/v1'

# Login
res = requests.post(f'{BASE_URL}/auth/login', json={
    'identifier': 'AB/23A/1234',
    'password': 'password'
})
token = res.json()['data']['accessToken']

# Get feed
feed = requests.get(f'{BASE_URL}/feed', params={'limit': 20},
    headers={'Authorization': f'Bearer {token}'})
posts = feed.json()['data']['items']
```

### cURL

```bash
# Login
curl -X POST https://your-domain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"AB/23A/1234","password":"password"}'

# Get feed (replace TOKEN)
curl https://your-domain.com/api/v1/feed?limit=20 \
  -H "Authorization: Bearer TOKEN"
```

---

## Postman Collection

Import our official Postman collection for ready-to-use requests:

1. Download `POSTMAN_COLLECTION.json` from our developer portal
2. Open Postman → **Import** → select the file
3. Set the `baseUrl` collection variable to your server URL
4. Run **Login** to auto-populate the `accessToken` variable
5. All authenticated requests will use this token automatically

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2025-03 | Initial release — Auth, Users, Posts, Feed, Stories, Reels, Messaging, Notifications, Marketplace, Calls, Opportunities, Subscriptions |

---

## Support

| Contact | Details |
|---|---|
| Developer Portal | `https://developers.corpers-connect.com` (coming soon) |
| Email | `api@corpers-connect.com` |
| Status Page | `https://status.corpers-connect.com` (coming soon) |
| GitHub Issues | For SDK bugs and documentation corrections |

Response time SLAs: Free (best effort) · Starter (48h) · Growth (24h) · Enterprise (4h)
