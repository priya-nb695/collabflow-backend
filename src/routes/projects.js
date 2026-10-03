import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { requireRole } from '../utils/rbac.js';
import { validate, oid, dateOrNull } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Comment } from '../models/Comment.js';
import { Activity } from '../models/Activity.js';
import { projectCounts, toProjectDTO } from '../services/projects.js';
import { assertWorkspaceMember } from '../services/workspaces.js';

const r = Router();
r.use(requireAuth, workspaceContext);

const status = z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']);
const roleEnum = z.enum(['viewer', 'developer', 'manager', 'admin']);
const idParam = z.object({ id: oid });

const POPULATE = { path: 'members.user', select: 'name avatarUrl' };

async function loadProject(req) {
  const p = await Project.findOne({ _id: req.valid.params.id, workspace: req.workspaceId });
  if (!p) throw new AppError(404, 'Project not found', 'NOT_FOUND');
  return p;
}

r.get('/', validate({ query: z.object({ includeArchived: z.enum(['true', 'false']).optional() }) }), async (req, res) => {
  const filter = { workspace: req.workspaceId };
  if (req.valid.query.includeArchived !== 'true') filter.status = { $ne: 'archived' };
  const projects = await Project.find(filter).populate(POPULATE).sort('createdAt');
  const counts = await projectCounts(req.workspaceId);
  res.json({ projects: projects.map((p) => toProjectDTO(p, counts)) });
});

r.post(
  '/',
  requireRole('manager'),
  validate({
    body: z.object({
      key: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'Key must be 2–6 letters'),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(1000).optional(),
      status: status.default('planning'),
      startDate: dateOrNull.optional(),
      dueDate: dateOrNull.optional(),
    }),
  }),
  async (req, res) => {
    const project = await Project.create({
      ...req.valid.body,
      workspace: req.workspaceId,
      createdBy: req.user._id,
      members: [{ user: req.user._id, role: 'admin' }],
    });
    await project.populate(POPULATE);
    res.status(201).json({ project: toProjectDTO(project, new Map()) });
  },
);

r.get('/:id', validate({ params: idParam }), async (req, res) => {
  const p = await loadProject(req);
  await p.populate(POPULATE);
  res.json({ project: toProjectDTO(p, await projectCounts(req.workspaceId, [p._id])) });
});

r.patch(
  '/:id',
  requireRole('manager'),
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).max(80).optional(),
      description: z.string().trim().max(1000).nullable().optional(),
      status: status.optional(),
      startDate: dateOrNull.optional(),
      dueDate: dateOrNull.optional(),
    }),
  }),
  async (req, res) => {
    const p = await loadProject(req);
    Object.assign(p, req.valid.body);
    await p.save();
    await p.populate(POPULATE);
    res.json({ project: toProjectDTO(p, await projectCounts(req.workspaceId, [p._id])) });
  },
);

// "Delete" = archive. Hard delete is admin-only and cascades.
r.post('/:id/archive', requireRole('manager'), validate({ params: idParam }), async (req, res) => {
  const p = await loadProject(req);
  p.status = 'archived';
  await p.save();
  res.json({ ok: true });
});

r.delete('/:id', requireRole('admin'), validate({ params: idParam }), async (req, res) => {
  const p = await loadProject(req);
  const taskIds = (await Task.find({ project: p._id }).select('_id')).map((t) => t._id);
  await Promise.all([
    Comment.deleteMany({ task: { $in: taskIds } }),
    Activity.deleteMany({ project: p._id }),
    Task.deleteMany({ project: p._id }),
    p.deleteOne(),
  ]);
  res.json({ ok: true });
});

r.get('/:id/members', validate({ params: idParam }), async (req, res) => {
  const p = await loadProject(req);
  await p.populate('members.user', 'name email avatarUrl title');
  res.json({
    members: p.members.map((m) => ({
      userId: String(m.user._id),
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      title: m.user.title,
      role: m.role,
    })),
  });
});

r.post(
  '/:id/members',
  requireRole('manager'),
  validate({ params: idParam, body: z.object({ userId: oid, role: roleEnum.default('developer') }) }),
  async (req, res) => {
    const { userId, role } = req.valid.body;
    await assertWorkspaceMember(req.workspaceId, userId);
    const p = await loadProject(req);
    const existing = p.members.find((m) => String(m.user) === userId);
    if (existing) existing.role = role;
    else p.members.push({ user: userId, role });
    await p.save();
    res.json({ ok: true });
  },
);

export default r;
