import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const projectSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    key: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ['planning', 'active', 'on_hold', 'completed', 'archived'],
      default: 'planning',
    },
    startDate: Date,
    dueDate: Date,
    taskCounter: { type: Number, default: 0 }, // atomic per-project task numbering
    members: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['viewer', 'developer', 'manager', 'admin'], default: 'developer' },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOpts },
);
projectSchema.index({ workspace: 1, key: 1 }, { unique: true });

export const Project = mongoose.model('Project', projectSchema);
