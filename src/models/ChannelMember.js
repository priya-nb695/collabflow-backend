import mongoose from 'mongoose';
import { jsonOpts } from './_shared.js';

const channelMemberSchema = new mongoose.Schema(
  {
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: jsonOpts },
);
channelMemberSchema.index({ channel: 1, user: 1 }, { unique: true });

export const ChannelMember = mongoose.model('ChannelMember', channelMemberSchema);