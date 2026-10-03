import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true },
    logoUrl: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: jsonOpts },
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);
