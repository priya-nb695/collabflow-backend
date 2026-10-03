import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const inviteSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['viewer', 'developer', 'manager', 'admin'], default: 'developer' },
    tokenHash: { type: String, required: true, unique: true }, // plain token is shown once, never stored
    status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending' },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOpts },
);
inviteSchema.index({ workspace: 1, email: 1, status: 1 });

export const Invite = mongoose.model('Invite', inviteSchema);
