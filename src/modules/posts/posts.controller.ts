import { Request, Response, NextFunction } from 'express';
import { postsService } from './posts.service';
import { sendSuccess, sendCreated } from '../../shared/utils/apiResponse';
import {
  createPostSchema,
  updatePostSchema,
  reactSchema,
  addCommentSchema,
  commentReactionSchema,
  reportSchema,
  paginationSchema,
} from './posts.validation';
import { ReactionType } from '@prisma/client';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const postsController = {
  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = createPostSchema.parse(req.body);
      const data = await postsService.createPost(req.user!.id, dto);
      sendCreated(res, data, 'Post created');
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await postsService.getPost(req.user?.id, p(req.params.postId));
      sendSuccess(res, data, 'Post retrieved');
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = updatePostSchema.parse(req.body);
      const data = await postsService.updatePost(req.user!.id, p(req.params.postId), dto);
      sendSuccess(res, data, 'Post updated');
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await postsService.deletePost(req.user!.id, p(req.params.postId));
      sendSuccess(res, null, 'Post deleted');
    } catch (err) {
      next(err);
    }
  },

  async share(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await postsService.sharePost(req.user!.id, p(req.params.postId));
      sendSuccess(res, data, 'Post shared');
    } catch (err) {
      next(err);
    }
  },

  async report(req: Request, res: Response, next: NextFunction) {
    try {
      const { reason, details } = reportSchema.parse(req.body);
      await postsService.reportPost(req.user!.id, p(req.params.postId), reason, details);
      sendSuccess(res, null, 'Report submitted');
    } catch (err) {
      next(err);
    }
  },

  // ── Reactions ────────────────────────────────────────────────────────────────

  async react(req: Request, res: Response, next: NextFunction) {
    try {
      const { type } = reactSchema.parse(req.body);
      await postsService.react(req.user!.id, p(req.params.postId), type as ReactionType);
      sendSuccess(res, null, 'Reaction added');
    } catch (err) {
      next(err);
    }
  },

  async unreact(req: Request, res: Response, next: NextFunction) {
    try {
      await postsService.unreact(req.user!.id, p(req.params.postId));
      sendSuccess(res, null, 'Reaction removed');
    } catch (err) {
      next(err);
    }
  },

  async getReactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const data = await postsService.getReactions(p(req.params.postId), cursor, limit);
      sendSuccess(res, data, 'Reactions retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { content, parentId, mediaIndex } = addCommentSchema.parse(req.body);
      const data = await postsService.addComment(
        req.user!.id,
        p(req.params.postId),
        content,
        parentId,
        mediaIndex,
      );
      sendCreated(res, data, 'Comment added');
    } catch (err) {
      next(err);
    }
  },

  async deleteComment(req: Request, res: Response, next: NextFunction) {
    try {
      await postsService.deleteComment(
        req.user!.id,
        p(req.params.postId),
        p(req.params.commentId),
      );
      sendSuccess(res, null, 'Comment deleted');
    } catch (err) {
      next(err);
    }
  },

  async getComments(req: Request, res: Response, next: NextFunction) {
    try {
      const { cursor, limit } = paginationSchema.parse(req.query);
      const mediaIndexRaw = req.query.mediaIndex;
      const mediaIndex = mediaIndexRaw !== undefined ? parseInt(mediaIndexRaw as string, 10) : undefined;
      const data = await postsService.getComments(p(req.params.postId), cursor, limit, isNaN(mediaIndex!) ? undefined : mediaIndex);
      sendSuccess(res, data, 'Comments retrieved');
    } catch (err) {
      next(err);
    }
  },

  // ── Comment Reactions ─────────────────────────────────────────────────────────

  async reactToComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { emoji } = commentReactionSchema.parse(req.body);
      const data = await postsService.reactToComment(
        req.user!.id,
        p(req.params.postId),
        p(req.params.commentId),
        emoji,
      );
      sendSuccess(res, data, 'Reaction added');
    } catch (err) {
      next(err);
    }
  },

  async removeCommentReaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { emoji } = commentReactionSchema.parse(req.body);
      const data = await postsService.removeCommentReaction(
        req.user!.id,
        p(req.params.postId),
        p(req.params.commentId),
        emoji,
      );
      sendSuccess(res, data, 'Reaction removed');
    } catch (err) {
      next(err);
    }
  },

  // ── Bookmarks ─────────────────────────────────────────────────────────────────

  async bookmark(req: Request, res: Response, next: NextFunction) {
    try {
      await postsService.bookmark(req.user!.id, p(req.params.postId));
      sendSuccess(res, null, 'Post bookmarked');
    } catch (err) {
      next(err);
    }
  },

  async unbookmark(req: Request, res: Response, next: NextFunction) {
    try {
      await postsService.unbookmark(req.user!.id, p(req.params.postId));
      sendSuccess(res, null, 'Bookmark removed');
    } catch (err) {
      next(err);
    }
  },
};
