import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a unique request ID to every incoming request.
 *
 * - Reuses the client-supplied X-Request-ID header if present (useful for
 *   end-to-end tracing from the frontend), otherwise generates a fresh UUID.
 * - Attaches the ID to `req.id` so controllers and error handlers can log it.
 * - Echoes it back in the X-Request-ID response header so Railway logs and
 *   the client can correlate a response with its server-side log entries.
 *
 * Must be mounted BEFORE morgan and all route handlers.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
