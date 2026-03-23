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
