import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

// Minimal for now (seed data + future chat phase extends this).
const channelSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    name: { type: String, required: true, trim: true },
    description: String,
    isPrivate: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOpts },
);
channelSchema.index({ workspace: 1, name: 1 }, { unique: true });

export const Channel = mongoose.model('Channel', channelSchema);