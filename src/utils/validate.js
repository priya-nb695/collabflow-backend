import { z } from 'zod';

export const oid = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * validate({ body, query, params }) — parsed values land in req.valid.*
 * (Express 5 makes req.query read-only, so we never overwrite req.*)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ['body', 'query', 'params']) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key]);
  }
  next();
};

// "2026-03-01" | null  ->  Date | null
export const dateOrNull = z
  .string()
  .date()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));
