import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: String,
    ip: String,
    revokedAt: Date,
    // Mongo deletes the document automatically once expiresAt passes
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, toJSON: jsonOpts },
);

export const Session = mongoose.model('Session', sessionSchema);
