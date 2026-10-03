import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { requireRole } from '../utils/rbac.js';
import { validate, oid } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
import { createWorkspaceFor } from '../services/workspaces.js';

const r = Router();
r.use(requireAuth);

r.get('/', async (req, res) => {
  const rows = await Membership.find({ user: req.user._id, status: 'active' }).populate('workspace');
  const activeId = String(req.user.activeWorkspace ?? '');
  res.json({
    workspaces: rows.map((m) => ({ ...m.workspace.toJSON(), role: m.role, isActive: String(m.workspace._id) === activeId })),
  });
});

r.post('/', validate({ body: z.object({ name: z.string().trim().min(2).max(60) }) }), async (req, res) => {
  const ws = await createWorkspaceFor(req.user, req.valid.body.name);
  res.status(201).json({ workspace: { ...ws.toJSON(), role: 'admin' } });
});

r.post('/switch', validate({ body: z.object({ workspaceId: oid }) }), async (req, res) => {
  const m = await Membership.exists({ workspace: req.valid.body.workspaceId, user: req.user._id, status: 'active' });
  if (!m) throw new AppError(403, 'You are not a member of this workspace', 'NOT_A_MEMBER');
  req.user.activeWorkspace = req.valid.body.workspaceId;
  await req.user.save();
  res.json({ ok: true });
});

r.get('/current', workspaceContext, async (req, res) => {
  const ws = await Workspace.findById(req.workspaceId);
  res.json({ workspace: { ...ws.toJSON(), role: req.role } });
});

r.patch(
  '/current',
  workspaceContext,
  requireRole('admin'),
  validate({ body: z.object({ name: z.string().trim().min(2).max(60).optional(), logoUrl: z.string().url().nullable().optional() }) }),
  async (req, res) => {
    const ws = await Workspace.findByIdAndUpdate(req.workspaceId, req.valid.body, { new: true });
    res.json({ workspace: ws.toJSON() });
  },
);

export default r;
