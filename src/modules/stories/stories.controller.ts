import { Request, Response, NextFunction } from 'express';
import { storiesService } from './stories.service';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { createStorySchema, addHighlightSchema } from './stories.validation';
import { uploadMediaToCloudinary } from '../../shared/middleware/upload.middleware';

const p = (val: string | string[]) => (Array.isArray(val) ? val[0] : val);

export const storiesController = {
  async createStory(req: Request, res: Response, next: NextFunction) {
    try {
      const { caption } = createStorySchema.parse(req.body);
      if (!req.file) {
        res.status(400).json({ message: 'Media file is required' });
        return;
      }
      const { url, mediaType } = await uploadMediaToCloudinary(req.file.buffer, 'corpers-connect/stories');
      const story = await storiesService.createStory(req.user!.id, url, mediaType, caption);
      sendSuccess(res, story, 'Story created', 201);
    } catch (err) {
      next(err);
    }
  },

  async getStories(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await storiesService.getStories(req.user!.id);
      sendSuccess(res, data, 'Stories retrieved');
    } catch (err) {
      next(err);
    }
  },

  async viewStory(req: Request, res: Response, next: NextFunction) {
    try {
      const story = await storiesService.viewStory(req.user!.id, p(req.params.storyId));
      sendSuccess(res, story, 'Story viewed');
    } catch (err) {
      next(err);
    }
  },

  async deleteStory(req: Request, res: Response, next: NextFunction) {
    try {
      await storiesService.deleteStory(req.user!.id, p(req.params.storyId));
      sendSuccess(res, null, 'Story deleted');
    } catch (err) {
      next(err);
    }
  },

  async addHighlight(req: Request, res: Response, next: NextFunction) {
    try {
      const { title } = addHighlightSchema.parse(req.body);
      await storiesService.addHighlight(req.user!.id, p(req.params.storyId), title);
      sendSuccess(res, null, 'Highlight added');
    } catch (err) {
      next(err);
    }
  },

  async removeHighlight(req: Request, res: Response, next: NextFunction) {
    try {
      await storiesService.removeHighlight(req.user!.id, p(req.params.storyId));
      sendSuccess(res, null, 'Highlight removed');
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

  async reactToStory(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await storiesService.reactToStory(req.user!.id, p(req.params.storyId));
      sendSuccess(res, result, result.reacted ? 'Reacted' : 'Reaction removed');
    } catch (err) {
      next(err);
    }
  },

  async replyToStory(req: Request, res: Response, next: NextFunction) {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ message: 'Reply content is required' });
        return;
      }
      const result = await storiesService.replyToStory(req.user!.id, p(req.params.storyId), content);
      sendSuccess(res, result, 'Reply sent as message', 201);
    } catch (err) {
      next(err);
    }
  },

  async getStoryViewers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await storiesService.getStoryViewers(req.user!.id, p(req.params.storyId));
      sendSuccess(res, data, 'Viewers retrieved');
    } catch (err) {
      next(err);
    }
  },
};
