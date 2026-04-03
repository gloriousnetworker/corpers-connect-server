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

// ── My Listings ───────────────────────────────────────────────────────────────

/** GET /api/v1/marketplace/my-listings
 *  Paginated list of authenticated user's own listings (all statuses).
 *  Query: ?cursor=&limit=20
 */
router.get('/my-listings', authenticate, marketplaceController.getMyListings);

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

export default router;
