import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import {
  updateMeSchema,
  onboardSchema,
  paginationSchema,
  changeEmailInitiateSchema,
  changeEmailVerifySchema,
  requestCorperUpgradeSchema,
} from './users.validation';
import {
  avatarUpload, bannerUpload, cvUpload,
  uploadToCloudinary, uploadMediaToCloudinary, uploadDocumentToCloudinary,
} from '../../shared/middleware/upload.middleware';
import { AppError } from '../../shared/utils/errors';
import { postsService } from '../posts/posts.service';
import { storiesService } from '../stories/stories.service';

// Express params are typed string | string[] — always extract as string
const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const usersController = {
  // ── Own Profile ──────────────────────────────────────────────────────────────

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await usersService.getMe(req.user!.id);
      sendSuccess(res, data, 'Profile retrieved');
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updateMeSchema.parse(req.body);
      const data = await usersService.updateMe(req.user!.id, dto);
      sendSuccess(res, data, 'Profile updated');
    } catch (err) {
      next(err);
    }
  },

  async onboard(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = onboardSchema.parse(req.body);
      const data = await usersService.onboard(req.user!.id, dto);
      sendSuccess(res, data, 'Onboarding complete');
    } catch (err) {
      next(err);
    }
  },

  // Avatar upload: multer parses the file first, then we upload to Cloudinary
  uploadAvatar(req: Request, res: Response, next: NextFunction) {
    avatarUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        if (!req.file) throw new AppError('No image file provided', 400);
        const url = await uploadToCloudinary(req.file.buffer, 'corpers_connect/avatars');
        const data = await usersService.updateAvatar(req.user!.id, url);
        sendSuccess(res, data, 'Avatar updated');
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  },

  // Banner upload: images or short videos (uses bannerUpload — 50 MB, image+video, field: "banner")
  uploadBanner(req: Request, res: Response, next: NextFunction) {
    bannerUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        if (!req.file) throw new AppError('No file provided', 400);
        const { url } = await uploadMediaToCloudinary(req.file.buffer, 'corpers_connect/banners');
        const data = await usersService.updateBanner(req.user!.id, url);
        sendSuccess(res, data, 'Banner updated');
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  },

  // CV / resume upload: PDF, DOC, or DOCX, max 5 MB, field: "cv"
  uploadCv(req: Request, res: Response, next: NextFunction) {
    cvUpload(req, res, async (err) => {
      if (err) return next(err instanceof Error ? err : new AppError(String(err), 400));
      try {
        if (!req.file) throw new AppError('No file provided', 400);
        const url = await uploadDocumentToCloudinary(req.file.buffer, 'corpers_connect/cvs');
        const data = await usersService.updateCv(req.user!.id, url);
        sendSuccess(res, data, 'CV updated');
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  },

  // ── Email Change ─────────────────────────────────────────────────────────────

  async initiateEmailChange(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = changeEmailInitiateSchema.parse(req.body);
      const data = await usersService.initiateEmailChange(req.user!.id, dto);
      sendSuccess(res, { maskedEmail: data.maskedEmail, ...(data.devOtp ? { devOtp: data.devOtp } : {}) }, data.message);
    } catch (err) {
      next(err);
    }
  },

  async verifyEmailChange(req: Request, res: Response, next: NextFunction) {
    try {
      const { otp } = changeEmailVerifySchema.parse(req.body);
      const data = await usersService.verifyEmailChange(req.user!.id, otp);
      sendSuccess(res, data.user, data.message);
    } catch (err) {
      next(err);
    }
  },

  // ── Public Profile ───────────────────────────────────────────────────────────

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await usersService.getProfile(req.user?.id, p(req.params.userId));
      sendSuccess(res, data, 'Profile retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Follow ───────────────────────────────────────────────────────────────────

  async follow(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.follow(req.user!.id, p(req.params.userId));
      sendSuccess(res, null, 'Followed successfully');
    } catch (err) {
      next(err);
    }
  },

  async unfollow(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.unfollow(req.user!.id, p(req.params.userId));
      sendSuccess(res, null, 'Unfollowed successfully');
    } catch (err) {
      next(err);
    }
  },

  async getFollowers(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await usersService.getFollowers(p(req.params.userId), req.user?.id, cursor, limit);
      sendSuccess(res, data, 'Followers retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getFollowing(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await usersService.getFollowing(p(req.params.userId), req.user?.id, cursor, limit);
      sendSuccess(res, data, 'Following retrieved');
    } catch (err) {
      next(err);
    }
  },

  async isFollowing(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await usersService.isFollowing(req.user!.id, p(req.params.userId));
      sendSuccess(res, data, 'Follow status retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Block ────────────────────────────────────────────────────────────────────

  async blockUser(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.blockUser(req.user!.id, p(req.params.userId));
      sendSuccess(res, null, 'User blocked');
    } catch (err) {
      next(err);
    }
  },

  async unblockUser(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.unblockUser(req.user!.id, p(req.params.userId));
      sendSuccess(res, null, 'User unblocked');
    } catch (err) {
      next(err);
    }
  },

  async getBlockedUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await usersService.getBlockedUsers(req.user!.id);
      sendSuccess(res, data, 'Blocked users retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Posts & Content ──────────────────────────────────────────────────────────

  async getUserPosts(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      // Optional: include posts where this user is tagged, not just ones they authored.
      const includeTagged = req.query.includeTagged === 'true';
      const data = await postsService.getUserPosts(
        req.user?.id,
        p(req.params.userId),
        cursor,
        limit,
        { includeTagged },
      );
      sendSuccess(res, data, 'Posts retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getBookmarks(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await postsService.getBookmarks(req.user!.id, cursor, limit);
      sendSuccess(res, data, 'Bookmarks retrieved');
    } catch (err) {
      next(err);
    }
  },

  async getUserHighlights(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await storiesService.getUserHighlights(p(req.params.userId));
      sendSuccess(res, data, 'Highlights retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── FCM Tokens ───────────────────────────────────────────────────────────────

  async addFcmToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken || typeof fcmToken !== 'string') {
        return res.status(422).json({ status: 'error', message: 'fcmToken is required' });
      }
      await usersService.addFcmToken(req.user!.id, fcmToken);
      sendSuccess(res, null, 'FCM token registered');
    } catch (err) {
      next(err);
    }
  },

  async removeFcmToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken || typeof fcmToken !== 'string') {
        return res.status(422).json({ status: 'error', message: 'fcmToken is required' });
      }
      await usersService.removeFcmToken(req.user!.id, fcmToken);
      sendSuccess(res, null, 'FCM token removed');
    } catch (err) {
      next(err);
    }
  },

  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      await usersService.deleteAccount(req.user!.id);
      sendSuccess(res, null, 'Account deleted');
    } catch (err) {
      next(err);
    }
  },

  // ── Corper upgrade ──────────────────────────────────────────────────────────

  async getMyCorperUpgrade(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await usersService.getMyCorperUpgrade(req.user!.id);
      sendSuccess(res, data, 'Upgrade status retrieved');
    } catch (err) {
      next(err);
    }
  },

  async requestCorperUpgrade(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError('Please upload your NYSC document.', 400);
      const { stateCode } = requestCorperUpgradeSchema.parse(req.body);
      const data = await usersService.requestCorperUpgrade(req.user!.id, {
        stateCode,
        document: { buffer: req.file.buffer, mimetype: req.file.mimetype },
      });
      sendSuccess(res, data, "Upgrade request submitted — we'll review it within 24-48h.");
    } catch (err) {
      next(err);
    }
  },
};
