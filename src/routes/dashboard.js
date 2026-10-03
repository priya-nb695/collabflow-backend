import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Membership } from '../models/Membership.js';
import { Activity } from '../models/Activity.js';
import { projectCounts } from '../services/projects.js';
import { TASK_POPULATE, toTaskDTO } from '../services/tasks.js';

const r = Router();
r.use(requireAuth, workspaceContext);

// One round trip: everything the dashboard needs.
r.get('/', async (req, res) => {
  const ws = req.workspaceId;
  const [activeProjects, activeTasks, doneTasks, teamMembers, myTasks, activity, projects, counts] = await Promise.all([
    Project.countDocuments({ workspace: ws, status: 'active' }),
    Task.countDocuments({ workspace: ws, status: { $ne: 'done' } }),
    Task.countDocuments({ workspace: ws, status: 'done' }),
    Membership.countDocuments({ workspace: ws, status: 'active' }),
    Task.find({ workspace: ws, assignee: req.user._id, status: { $ne: 'done' } })
      .populate(TASK_POPULATE)
      .sort({ dueDate: 1 })
      .limit(8),
    Activity.find({ workspace: ws })
      .populate('actor', 'name avatarUrl')
      .populate({ path: 'task', select: 'number title project', populate: { path: 'project', select: 'key name' } })
      .sort('-createdAt')
      .limit(10),
    Project.find({ workspace: ws, status: { $ne: 'archived' } }).sort('createdAt').limit(6),
    projectCounts(ws),
  ]);

  res.json({
    greetingName: req.user.name.split(' ')[0],
    stats: { activeProjects, activeTasks, completedTasks: doneTasks, teamMembers },
    myTasks: myTasks.map(toTaskDTO),
    recentActivity: activity.filter((a) => a.task).map((a) => a.toJSON()),
    projectProgress: projects.map((p) => {
      const c = counts.get(String(p._id)) ?? { total: 0, done: 0 };
      return {
        id: String(p._id),
        key: p.key,
        name: p.name,
        status: p.status,
        dueDate: p.dueDate,
        progress: c.total === 0 ? 0 : Math.round((c.done / c.total) * 100),
      };
    }),
  });
});

export default r;
