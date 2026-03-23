import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';
import { env } from '../../config/env';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // Custom validation errors
  if (err instanceof ValidationError) {
    res.status(422).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  // Known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Prisma errors
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === 'P2002') {
    res.status(409).json({ success: false, message: 'A record with this value already exists' });
    return;
  }
  if (prismaCode === 'P2025') {
    res.status(404).json({ success: false, message: 'Record not found' });
    return;
  }
  // Table does not exist — schema not pushed yet
  if (prismaCode === 'P2021' || prismaCode === 'P1001' || prismaCode === 'P1003') {
    console.error(`[DB ERROR ${prismaCode}]`, err.message);
    res.status(503).json({ success: false, message: 'Database not ready. Please try again.' });
    return;
  }

  // Unknown errors — always log full error, only expose stack in dev
  console.error(`[500] ${err.name}: ${err.message}`, err.stack);
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    ...(env.NODE_ENV === 'development' && { error: err.message, stack: err.stack }),
  });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
};
