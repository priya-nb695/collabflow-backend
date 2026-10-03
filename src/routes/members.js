import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { requireRole } from '../utils/rbac.js';
import { validate, oid } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { Membership } from '../models/Membership.js';
import { Workspace } from '../models/Workspace.js';

const r = Router();
r.use(requireAuth, workspaceContext);

const roleEnum = z.enum(['viewer', 'developer', 'manager', 'admin']);

r.get('/', async (req, res) => {
  const rows = await Membership.find({ workspace: req.workspaceId })
    .populate('user', 'name email avatarUrl title lastSeenAt')
    .sort('createdAt');
  res.json({
    members: rows
      .filter((m) => m.user) // skip orphans
      .map((m) => ({
        membershipId: String(m._id),
        userId: String(m.user._id),
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        title: m.user.title,
        lastSeenAt: m.user.lastSeenAt,
        role: m.role,
        status: m.status,
      })),
  });
});

async function loadTarget(req) {
  const target = await Membership.findOne({ _id: req.valid.params.id, workspace: req.workspaceId });
  if (!target) throw new AppError(404, 'Member not found', 'NOT_FOUND');
  const ws = await Workspace.findById(req.workspaceId).select('owner');
  if (String(ws.owner) === String(target.user)) {
    throw new AppError(403, "The workspace owner can't be changed or removed", 'FORBIDDEN');
  }
  return target;
}

r.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: z.object({ id: oid }), body: z.object({ role: roleEnum }) }),
  async (req, res) => {
    const target = await loadTarget(req);
    target.role = req.valid.body.role;
    await target.save();
    res.json({ ok: true });
  },
);

r.delete('/:id', requireRole('admin'), validate({ params: z.object({ id: oid }) }), async (req, res) => {
  const target = await loadTarget(req);
  await target.deleteOne();
  res.json({ ok: true });
});

export default r;
