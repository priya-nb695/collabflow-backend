import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

// Roles live HERE, never on the User document.
const membershipSchema = new mongoose.Schema(
  {
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['viewer', 'developer', 'manager', 'admin'], default: 'developer' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOpts },
);
membershipSchema.index({ workspace: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1, status: 1 });

export const Membership = mongoose.model('Membership', membershipSchema);
