import { Activity } from '../models/Activity.js';

export const TASK_POPULATE = [
  { path: 'assignee', select: 'name avatarUrl' },
  { path: 'project', select: 'key name' },
];

export function toTaskDTO(task) {
  const o = task.toJSON();
  o.ref = o.project?.key ? `${o.project.key}-${o.number}` : `#${o.number}`;
  return o;
}

const TRACKED = new Set(['status', 'assignee', 'priority', 'dueDate']);
const norm = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/**
 * Applies a patch, keeps completedAt in sync with status, saves, and writes activity
 * rows for tracked fields (this replaces DB triggers).
 */
export async function applyTaskChanges(task, patch, actorId) {
  const activity = [];
  for (const [key, value] of Object.entries(patch)) {
    if (norm(task[key]) === norm(value)) continue;
    if (TRACKED.has(key)) {
      activity.push({ action: `${key}_changed`, from: norm(task[key]), to: norm(value) });
    }
    task[key] = value;
  }
  if (task.isModified('status')) task.completedAt = task.status === 'done' ? new Date() : null;

  await task.save();
  if (activity.length) {
    await Activity.insertMany(
      activity.map((a) => ({ ...a, workspace: task.workspace, project: task.project, task: task._id, actor: actorId })),
    );
  }
  return task;
}
