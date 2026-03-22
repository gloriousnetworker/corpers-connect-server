import { Response } from 'express';

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  cursor?: string | null;
}

export const sendSuccess = (
  res: Response,
  data: unknown = null,
  message = 'Success',
  statusCode = 200,
  meta?: Meta,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta && { meta }),
  });
};

export const sendCreated = (res: Response, data: unknown, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown,
) => {
  const body: Record<string, unknown> = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
};
