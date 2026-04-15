import { Router } from 'express';
import { booksController } from './books.controller';
import { authenticate, optionalAuth } from '../auth/auth.middleware';
import { bookPublishUpload } from '../../shared/middleware/upload.middleware';

const router = Router();

// ── Browse (public) ──────────────────────────────────────────────────────────
router.get('/', optionalAuth, booksController.list);

// ── My library (own) ─────────────────────────────────────────────────────────
router.get('/my/library', authenticate, booksController.myLibrary);
router.get('/my/published', authenticate, booksController.myPublished);

// ── Publish + manage ─────────────────────────────────────────────────────────
router.post('/', authenticate, bookPublishUpload, booksController.create);

// ── Single book ──────────────────────────────────────────────────────────────
router.get('/:bookId', optionalAuth, booksController.getOne);
router.patch('/:bookId', authenticate, booksController.update);
router.delete('/:bookId', authenticate, booksController.remove);

// ── Reading ──────────────────────────────────────────────────────────────────
router.get('/:bookId/read', optionalAuth, booksController.getReadUrl);
router.patch('/:bookId/progress', authenticate, booksController.updateProgress);
router.get('/:bookId/progress', authenticate, booksController.getProgress);
router.post('/:bookId/highlights', authenticate, booksController.addHighlight);

// ── Purchase ─────────────────────────────────────────────────────────────────
router.post('/:bookId/purchase', authenticate, booksController.initiatePurchase);

// ── Reviews ──────────────────────────────────────────────────────────────────
router.get('/:bookId/reviews', optionalAuth, booksController.listReviews);
router.post('/:bookId/reviews', authenticate, booksController.createReview);

export default router;
