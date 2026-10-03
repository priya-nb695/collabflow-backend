import { Task } from '../models/Task.js';

/** Map<projectId, {total, done}> for the given workspace (optionally restricted to project ids). */
export async function projectCounts(workspaceId, projectIds) {
  const match = { workspace: workspaceId };
  if (projectIds) match.project = { $in: projectIds };
  const rows = await Task.aggregate([
    { $match: match },
    { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, done: r.done }]));
}

export function toProjectDTO(project, counts) {
  const o = project.toJSON();
  const c = counts.get(o.id) ?? { total: 0, done: 0 };
  o.taskCount = c.total;
  o.doneCount = c.done;
  o.progress = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
  delete o.taskCounter;
  return o;
}
