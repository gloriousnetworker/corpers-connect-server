import multer from 'multer';
import { cloudinary } from '../../config/cloudinary';
import { AppError } from '../utils/errors';
import { Request } from 'express';

const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new AppError('Only image files are allowed', 400));
  }
  cb(null, true);
};

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: imageFilter,
}).single('avatar');

// For stories and reels: images OR videos up to 50 MB
export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new AppError('Only image and video files are allowed', 400));
    }
    cb(null, true);
  },
}).single('media');

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  transformations: object = { width: 400, height: 400, crop: 'fill', quality: 'auto', format: 'webp' },
): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, transformation: [transformations] },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });

// For marketplace listings — up to 5 images, images only, 10 MB each
export const listingImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10 MB per file, max 5
  fileFilter: imageFilter,
}).array('images', 5);

// For seller ID document upload — single image, 10 MB
export const idDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
}).single('idDoc');

// For stories/reels — auto-detect image vs video
export const uploadMediaToCloudinary = (
  buffer: Buffer,
  folder: string,
): Promise<{ url: string; mediaType: 'image' | 'video' }> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve({
          url: result.secure_url,
          mediaType: result.resource_type === 'video' ? 'video' : 'image',
        });
      },
    );
    stream.end(buffer);
  });
