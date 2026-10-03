import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { requireRole, atLeast } from '../utils/rbac.js';
import { validate, oid, dateOrNull } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Comment } from '../models/Comment.js';
import { Activity } from '../models/Activity.js';
import { TASK_POPULATE, toTaskDTO, applyTaskChanges } from '../services/tasks.js';
import { assertWorkspaceMember } from '../services/workspaces.js';

const r = Router();
r.use(requireAuth, workspaceContext);

const status = z.enum(['todo', 'in_progress', 'review', 'done']);
const priority = z.enum(['low', 'medium', 'high', 'urgent']);
const idParam = z.object({ id: oid });
const labels = z.array(z.object({ name: z.string().trim().min(1).max(30), color: z.string().max(20).optional() })).max(20);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function loadTask(req) {
  const t = await Task.findOne({ _id: req.valid.params.id, workspace: req.workspaceId });
  if (!t) throw new AppError(404, 'Task not found', 'NOT_FOUND');
  return t;
}

const respond = async (res, task, code = 200) => {
  await task.populate(TASK_POPULATE);
  res.status(code).json({ task: toTaskDTO(task) });
};

// ---- list -----------------------------------------------------------
r.get(
  '/',
  validate({
    query: z.object({
      projectId: oid.optional(),
      status: status.optional(),
      assigneeId: oid.optional(),
      priority: priority.optional(),
      search: z.string().trim().max(100).optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = { workspace: req.workspaceId };
    if (q.projectId) filter.project = q.projectId;
    if (q.status) filter.status = q.status;
    if (q.assigneeId) filter.assignee = q.assigneeId;
    if (q.priority) filter.priority = q.priority;
    if (q.search) filter.title = { $regex: escapeRegex(q.search), $options: 'i' };
    const tasks = await Task.find(filter).populate(TASK_POPULATE).sort({ status: 1, position: 1 });
    res.json({ tasks: tasks.map(toTaskDTO) });
  },
);

r.get('/mine', async (req, res) => {
  const tasks = await Task.find({ workspace: req.workspaceId, assignee: req.user._id, status: { $ne: 'done' } })
    .populate(TASK_POPULATE)
    .sort({ dueDate: 1 });
  res.json({ tasks: tasks.map(toTaskDTO) });
});

// ---- create ---------------------------------------------------------
r.post(
  '/',
  requireRole('developer'),
  validate({
    body: z.object({
      projectId: oid,
      title: z.string().trim().min(1, 'Title is required').max(200),
      description: z.string().max(10000).optional(),
      status: status.default('todo'),
      priority: priority.default('medium'),
      assigneeId: oid.nullable().optional(),
      dueDate: dateOrNull.optional(),
      labels: labels.optional(),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    if (b.assigneeId) await assertWorkspaceMember(req.workspaceId, b.assigneeId);

    // Atomic per-project counter => no duplicate task numbers under concurrency.
    const project = await Project.findOneAndUpdate(
      { _id: b.projectId, workspace: req.workspaceId },
      { $inc: { taskCounter: 1 } },
      { new: true },
    );
    if (!project) throw new AppError(404, 'Project not found', 'NOT_FOUND');

    const last = await Task.findOne({ project: project._id, status: b.status }).sort('-position').select('position');
    const task = await Task.create({
      workspace: req.workspaceId,
      project: project._id,
      number: project.taskCounter,
      title: b.title,
      description: b.description,
      status: b.status,
      priority: b.priority,
      assignee: b.assigneeId ?? null,
      reporter: req.user._id,
      dueDate: b.dueDate ?? null,
      labels: b.labels ?? [],
      position: (last?.position ?? 0) + 1000,
      completedAt: b.status === 'done' ? new Date() : null,
    });
    await Activity.create({ workspace: req.workspaceId, project: project._id, task: task._id, actor: req.user._id, action: 'created' });
    await respond(res, task, 201);
  },
);

// ---- read / update / move / delete ----------------------------------
r.get('/:id', validate({ params: idParam }), async (req, res) => respond(res, await loadTask(req)));

r.patch(
  '/:id',
  requireRole('developer'),
  validate({
    params: idParam,
    body: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(10000).nullable().optional(),
      status: status.optional(),
      priority: priority.optional(),
      assigneeId: oid.nullable().optional(),
      dueDate: dateOrNull.optional(),
      labels: labels.optional(),
    }),
  }),
  async (req, res) => {
    const { assigneeId, ...rest } = req.valid.body;
    const patch = { ...rest };
    if (assigneeId !== undefined) {
      if (assigneeId) await assertWorkspaceMember(req.workspaceId, assigneeId);
      patch.assignee = assigneeId;
    }
    const task = await applyTaskChanges(await loadTask(req), patch, req.user._id);
    await respond(res, task);
  },
);

// Kanban drag-and-drop. Client computes `position` (midpoint between neighbours).
r.patch(
  '/:id/move',
  requireRole('developer'),
  validate({ params: idParam, body: z.object({ status, position: z.number().finite() }) }),
  async (req, res) => {
    const task = await applyTaskChanges(await loadTask(req), req.valid.body, req.user._id);
    await respond(res, task);
  },
);

r.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const task = await loadTask(req);
  const allowed = atLeast(req.role, 'manager') || (atLeast(req.role, 'developer') && String(task.reporter) === String(req.user._id));
  if (!allowed) throw new AppError(403, 'Only managers or the reporter can delete a task', 'FORBIDDEN');
  await Promise.all([Comment.deleteMany({ task: task._id }), Activity.deleteMany({ task: task._id }), task.deleteOne()]);
  res.json({ ok: true });
});

// ---- activity -------------------------------------------------------
r.get('/:id/activity', validate({ params: idParam }), async (req, res) => {
  const task = await loadTask(req);
  const rows = await Activity.find({ task: task._id }).populate('actor', 'name avatarUrl').sort('-createdAt').limit(100);
  res.json({ activity: rows.map((a) => a.toJSON()) });
});

// ---- comments (list + create live under the task) --------------------
r.get('/:id/comments', validate({ params: idParam }), async (req, res) => {
  const task = await loadTask(req);
  const rows = await Comment.find({ task: task._id }).populate('author', 'name avatarUrl').sort('createdAt');
  res.json({ comments: rows.map((c) => c.toJSON()) });
});

r.post(
  '/:id/comments',
  requireRole('developer'),
  validate({
    params: idParam,
    body: z.object({ body: z.string().trim().min(1, "Comment can't be empty").max(5000), parentId: oid.nullable().optional() }),
  }),
  async (req, res) => {
    const task = await loadTask(req);
    if (req.valid.body.parentId && !(await Comment.exists({ _id: req.valid.body.parentId, task: task._id }))) {
      throw new AppError(400, 'Parent comment not found', 'VALIDATION');
    }
    const c = await Comment.create({
      workspace: req.workspaceId,
      task: task._id,
      author: req.user._id,
      body: req.valid.body.body,
      parent: req.valid.body.parentId ?? null,
    });
    await c.populate('author', 'name avatarUrl');
    res.status(201).json({ comment: c.toJSON() });
  },
);

export default r;
