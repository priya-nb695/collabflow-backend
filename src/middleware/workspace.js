import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { Membership } from '../models/Membership.js';

/**
 * Resolves the workspace from the `x-workspace-id` header (falls back to the user's
 * active workspace) and loads the caller's membership. Everything downstream
 * scopes queries by req.workspaceId and checks req.role.
 */
export async function workspaceContext(req, _res, next) {
  const id = req.headers['x-workspace-id'] || req.user.activeWorkspace?.toString();
  if (!id || !mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'No workspace selected', 'WORKSPACE_REQUIRED');
  }
  const membership = await Membership.findOne({ workspace: id, user: req.user._id, status: 'active' });
  if (!membership) throw new AppError(403, 'You are not a member of this workspace', 'NOT_A_MEMBER');

  req.workspaceId = membership.workspace;
  req.membership = membership;
  req.role = membership.role;
  next();
}
