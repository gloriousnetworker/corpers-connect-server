import { Router } from 'express';
import { authenticate, optionalAuth } from '../auth/auth.middleware';
import { marketplaceController } from './marketplace.controller';

const router = Router();

// ── Seller Application ────────────────────────────────────────────────────────

/** POST /api/v1/marketplace/apply
 *  Submit a seller application. multipart/form-data, field: idDoc (image).
 */
router.post('/apply', authenticate, marketplaceController.applyAsSeller);

/** GET /api/v1/marketplace/my-application
 *  Get own seller application status.
 */
router.get('/my-application', authenticate, marketplaceController.getMyApplication);

// ── My Seller Profile ────────────────────────────────────────────────────────

/** GET /api/v1/marketplace/my-seller-profile
 *  Get own seller profile with aggregated stats.
 */
router.get('/my-seller-profile', authenticate, marketplaceController.getMySellerProfile);
router.post('/my-seller-profile/appeal', authenticate, marketplaceController.submitAppeal);
router.get('/my-seller-profile/appeals', authenticate, marketplaceController.getMyAppeals);
router.post('/my-seller-profile/appeals/:appealId/reply', authenticate, marketplaceController.replyToAppeal);

// ── My Listings ───────────────────────────────────────────────────────────────

/** GET /api/v1/marketplace/my-listings
 *  Paginated list of authenticated user's own listings (all statuses).
 *  Query: ?cursor=&limit=20
 */
router.get('/my-listings', authenticate, marketplaceController.getMyListings);

// ── Seller Profile (Public) ──────────────────────────────────────────────────

/** GET /api/v1/marketplace/sellers/:userId
 *  Get a seller's public profile.
 */
router.get('/sellers/:userId', optionalAuth, marketplaceController.getSellerProfile);

/** GET /api/v1/marketplace/sellers/:userId/listings
 *  Paginated active listings for a seller (public).
 *  Query: ?cursor=&limit=20
 */
router.get('/sellers/:userId/listings', optionalAuth, marketplaceController.getSellerListings);

// ── Listings ──────────────────────────────────────────────────────────────────

/** GET /api/v1/marketplace/listings
 *  Browse listings. Query: ?category=&listingType=&state=&search=&minPrice=&maxPrice=&cursor=&limit=
 *  Auth optional — used to filter blocked users' listings.
 */
router.get('/listings', optionalAuth, marketplaceController.listListings);

/** POST /api/v1/marketplace/listings
 *  Create a listing (approved seller only). multipart/form-data.
 *  Fields: images[] (up to 5), title, description, category?, price?, listingType?, location?
 */
router.post('/listings', authenticate, marketplaceController.createListing);

/** GET /api/v1/marketplace/listings/:listingId
 *  Get a single listing (increments viewCount).
 */
router.get('/listings/:listingId', optionalAuth, marketplaceController.getListing);

/** PATCH /api/v1/marketplace/listings/:listingId
 *  Update a listing (seller only).
 */
router.patch('/listings/:listingId', authenticate, marketplaceController.updateListing);

/** DELETE /api/v1/marketplace/listings/:listingId
 *  Delete a listing (seller only).
 */
router.delete('/listings/:listingId', authenticate, marketplaceController.deleteListing);

// ── Inquiries ─────────────────────────────────────────────────────────────────

/** POST /api/v1/marketplace/listings/:listingId/inquire
 *  Contact the seller about a listing. Creates inquiry record.
 */
router.post('/listings/:listingId/inquire', authenticate, marketplaceController.inquire);

/** GET /api/v1/marketplace/listings/:listingId/inquiries
 *  Seller: list all buyers who inquired about their listing.
 */
router.get('/listings/:listingId/inquiries', authenticate, marketplaceController.getListingInquiries);

// ── Listing Comments (Bidding) ────────────────────────────────────────────────

/** POST /api/v1/marketplace/listings/:listingId/comments
 *  Create a comment or bid on a listing.
 */
router.post('/listings/:listingId/comments', authenticate, marketplaceController.createListingComment);

/** GET /api/v1/marketplace/listings/:listingId/comments
 *  Get paginated top-level comments for a listing. Auth optional.
 */
router.get('/listings/:listingId/comments', optionalAuth, marketplaceController.getListingComments);

/** PATCH /api/v1/marketplace/listings/:listingId/comments/:commentId
 *  Update own comment.
 */
router.patch('/listings/:listingId/comments/:commentId', authenticate, marketplaceController.updateListingComment);

/** DELETE /api/v1/marketplace/listings/:listingId/comments/:commentId
 *  Soft delete a comment (author or listing seller).
 */
router.delete('/listings/:listingId/comments/:commentId', authenticate, marketplaceController.deleteListingComment);

// ── Reviews ───────────────────────────────────────────────────────────────────

/** GET /api/v1/marketplace/listings/:listingId/reviews
 *  Get paginated reviews for a listing. Auth optional.
 */
router.get('/listings/:listingId/reviews', optionalAuth, marketplaceController.getListingReviews);

/** POST /api/v1/marketplace/listings/:listingId/reviews
 *  Submit a review (1-5 stars + optional comment). One per user per listing.
 */
router.post('/listings/:listingId/reviews', authenticate, marketplaceController.createReview);

/** DELETE /api/v1/marketplace/listings/:listingId/reviews/:reviewId
 *  Delete own review.
 */
router.delete('/listings/:listingId/reviews/:reviewId', authenticate, marketplaceController.deleteReview);

// ── Marketplace Conversations ─────────────────────────────────────────────────

/** POST /api/v1/marketplace/listings/:listingId/chat
 *  Start or get existing marketplace conversation with a seller.
 */
router.post('/listings/:listingId/chat', authenticate, marketplaceController.startMarketplaceChat);

/** GET /api/v1/marketplace/conversations
 *  Get all marketplace conversations for the authenticated user.
 *  Query: ?cursor=&limit=20
 */
router.get('/conversations', authenticate, marketplaceController.getMarketplaceConversations);

/** GET /api/v1/marketplace/conversations/:conversationId
 *  Get a single marketplace conversation with full details.
 */
router.get('/conversations/:conversationId', authenticate, marketplaceController.getMarketplaceConversation);

export default router;
