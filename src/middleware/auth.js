import { AppError } from '../utils/AppError.js';
import { verifyAccess } from '../utils/tokens.js';
import { User } from '../models/User.js';

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Not authenticated', 'UNAUTHENTICATED');

  let payload;
  try {
    payload = verifyAccess(header.slice(7));
  } catch {
    throw new AppError(401, 'Token invalid or expired', 'TOKEN_EXPIRED');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'Account no longer exists', 'UNAUTHENTICATED');
  req.user = user;
  next();
}
