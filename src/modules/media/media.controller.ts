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

    const { url, mediaType } = await uploadMediaToCloudinary(
      req.file.buffer,
      'corpers-connect/posts',
    );

    res.status(200).json({
      success: true,
      data: { url, mediaType },
    });
  } catch (error) {
    next(error);
  }
};
