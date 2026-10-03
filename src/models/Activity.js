import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const activitySchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true }, // created | status_changed | assignee_changed | ...
    from: String,
    to: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: jsonOpts },
);
activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ task: 1, createdAt: -1 });

export const Activity = mongoose.model('Activity', activitySchema);
