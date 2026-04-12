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

// For stories, reels, and message media: images, videos, or audio up to 50 MB
export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/');
    if (!ok) {
      return cb(new AppError('Only image, video, and audio files are allowed', 400));
    }
    cb(null, true);
  },
}).single('media');

// For profile banner — image or short video up to 50 MB, field name: "banner"
export const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    if (!ok) return cb(new AppError('Only image and video files are allowed', 400));
    cb(null, true);
  },
}).single('banner');

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

// For appeal attachments — images, PDF, DOC, DOCX up to 10 MB
export const appealAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Only images, PDF, DOC, and DOCX files are allowed', 400));
    }
    cb(null, true);
  },
}).single('attachment');

// For CV/resume uploads — PDF, DOC, DOCX, max 5 MB
export const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Only PDF, DOC, and DOCX files are allowed', 400));
    }
    cb(null, true);
  },
}).single('cv');

export const uploadDocumentToCloudinary = (buffer: Buffer, folder: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'raw' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });

/**
 * Upload any file (image, PDF, DOC) for appeal attachments.
 * Uses resource_type:'auto' so Cloudinary sets the correct MIME type,
 * and use_filename:true so the original filename (with extension) is
 * preserved in the URL — required for fl_inline PDF delivery.
 */
export const uploadAppealAttachmentToCloudinary = (buffer: Buffer, folder: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', use_filename: true, unique_filename: true },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });

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

/**
 * Extract the Cloudinary public_id from a secure_url.
 * Handles URLs with or without transformations and version strings.
 *
 * Example inputs:
 *   https://res.cloudinary.com/cloud/image/upload/c_fill,w_400/v123/folder/name.webp
 *   https://res.cloudinary.com/cloud/image/upload/v123/folder/name.webp
 *   https://res.cloudinary.com/cloud/image/upload/folder/name.webp
 */
export function extractCloudinaryPublicId(url: string): string | null {
  const afterUpload = url.split('/upload/')[1];
  if (!afterUpload) return null;

  const segments = afterUpload.split('/');
  // Skip leading transformation segments (contain commas) and version segments (v\d+)
  let i = 0;
  while (i < segments.length - 1) {
    if (segments[i].includes(',') || /^v\d+$/.test(segments[i])) {
      i++;
    } else {
      break;
    }
  }

  const publicIdWithExt = segments.slice(i).join('/');
  // Strip file extension
  return publicIdWithExt.replace(/\.[^./]+$/, '') || null;
}

/**
 * Destroy a Cloudinary asset by URL. Detects resource_type from the URL path.
 * Fails silently — a cleanup failure should never abort the main DB operation.
 */
export async function destroyCloudinaryAsset(url: string): Promise<void> {
  if (!url || !url.includes('cloudinary.com')) return;

  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;

  const resourceType: 'image' | 'video' | 'raw' = url.includes('/video/upload/')
    ? 'video'
    : url.includes('/raw/upload/')
      ? 'raw'
      : 'image';

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`[Cloudinary] Failed to destroy ${publicId}:`, err);
  }
}
