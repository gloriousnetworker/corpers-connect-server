import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { mediaUpload } from '../../shared/middleware/upload.middleware';
import { uploadMedia } from './media.controller';

const router = Router();

/**
 * POST /api/v1/media/upload
 * Authenticated users can upload a single image or video (max 50 MB).
 * Returns { success: true, data: { url, mediaType } }
 */
router.post('/upload', authenticate, mediaUpload, uploadMedia);

export default router;
