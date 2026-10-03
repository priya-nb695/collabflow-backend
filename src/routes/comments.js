import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { atLeast } from '../utils/rbac.js';
import { validate, oid } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { Comment } from '../models/Comment.js';

const r = Router();
r.use(requireAuth, workspaceContext);

const idParam = z.object({ id: oid });

async function loadComment(req) {
  const c = await Comment.findOne({ _id: req.valid.params.id, workspace: req.workspaceId });
  if (!c) throw new AppError(404, 'Comment not found', 'NOT_FOUND');
  return c;
}

r.patch(
  '/:id',
  validate({ params: idParam, body: z.object({ body: z.string().trim().min(1).max(5000) }) }),
  async (req, res) => {
    const c = await loadComment(req);
    if (String(c.author) !== String(req.user._id)) throw new AppError(403, 'You can only edit your own comments', 'FORBIDDEN');
    if (!atLeast(req.role, 'developer')) throw new AppError(403, 'Viewers cannot edit comments', 'FORBIDDEN');
    c.body = req.valid.body.body;
    c.editedAt = new Date();
    await c.save();
    await c.populate('author', 'name avatarUrl');
    res.json({ comment: c.toJSON() });
  },
);

r.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const c = await loadComment(req);
  const mine = String(c.author) === String(req.user._id);
  if (!mine && !atLeast(req.role, 'manager')) throw new AppError(403, 'Not allowed to delete this comment', 'FORBIDDEN');
  await Comment.deleteMany({ $or: [{ _id: c._id }, { parent: c._id }] });
  res.json({ ok: true });
});

export default r;
