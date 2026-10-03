import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const commentSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 5000 },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    editedAt: Date,
  },
  { timestamps: true, toJSON: jsonOpts },
);
commentSchema.index({ task: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
