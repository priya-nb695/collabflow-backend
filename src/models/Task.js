import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const taskSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true }, // denormalised for scoping
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 10000 },
    status: { type: String, enum: ['todo', 'in_progress', 'review', 'done'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date, default: null },
    position: { type: Number, default: 0 }, // board ordering
    labels: [{ _id: false, name: { type: String, maxlength: 30 }, color: { type: String, default: '#6366f1' } }],
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonOpts },
);
taskSchema.index({ project: 1, number: 1 }, { unique: true });
taskSchema.index({ project: 1, status: 1, position: 1 });
taskSchema.index({ workspace: 1, assignee: 1, status: 1 });

export const Task = mongoose.model('Task', taskSchema);
