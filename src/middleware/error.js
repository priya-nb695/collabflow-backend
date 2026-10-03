import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export const notFound = (_req, res) =>
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] = i.message;
    return res.status(400).json({ error: { message: 'Validation failed', code: 'VALIDATION', fields } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { message: 'Invalid id', code: 'VALIDATION' } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { message: err.message, code: 'VALIDATION' } });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {}).find((k) => k !== 'workspace') ?? 'value';
    return res.status(409).json({ error: { message: `That ${field} is already in use`, code: 'DUPLICATE' } });
  }
  console.error(err);
  res.status(500).json({
    error: { message: env.NODE_ENV === 'production' ? 'Something went wrong' : err.message, code: 'INTERNAL' },
  });
}
