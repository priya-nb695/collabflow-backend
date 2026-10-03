import { AppError } from './AppError.js';

export const ROLE_RANK = { viewer: 0, developer: 1, manager: 2, admin: 3 };
export const atLeast = (role, min) => ROLE_RANK[role] >= ROLE_RANK[min];

/** Route guard. Role comes from the Membership row loaded server-side, never from the client. */
export const requireRole = (min) => (req, _res, next) => {
  if (!req.role || !atLeast(req.role, min)) {
    throw new AppError(403, `Requires ${min} role or higher`, 'FORBIDDEN');
  }
  next();
};
