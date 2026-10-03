import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatarUrl: String,
    title: { type: String, maxlength: 80 },
    timezone: { type: String, default: 'UTC' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language: { type: String, default: 'en' },
    lastSeenAt: Date,
    activeWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true, toJSON: jsonOpts },
);

export const User = mongoose.model('User', userSchema);
