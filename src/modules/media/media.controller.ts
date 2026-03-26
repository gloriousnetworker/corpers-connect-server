import { Request, Response, NextFunction } from 'express';
import { uploadMediaToCloudinary } from '../../shared/middleware/upload.middleware';
import { AppError } from '../../shared/utils/errors';

/**
 * POST /api/v1/media/upload
 * Uploads a single image or video to Cloudinary and returns the secure URL.
 * Used by the frontend for post media uploads (images in CreatePostModal).
 */
export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return next(new AppError('No file provided', 400));
    }

    // For audio files, upload to Cloudinary as raw/auto and always return 'audio'
    if (req.file.mimetype.startsWith('audio/')) {
      const { url } = await uploadMediaToCloudinary(req.file.buffer, 'corpers-connect/voice-notes');
      return res.status(200).json({ success: true, data: { url, mediaType: 'audio' } });
    }

    const { url, mediaType } = await uploadMediaToCloudinary(
      req.file.buffer,
      'corpers-connect/messages',
    );

    res.status(200).json({
      success: true,
      data: { url, mediaType },
    });
  } catch (error) {
    next(error);
  }
};
