import crypto from 'crypto';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
import { Invite } from '../models/Invite.js';
import { AppError } from '../utils/AppError.js';
import { sha256 } from '../utils/tokens.js';

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'workspace';

/** Creates a workspace, makes `user` its owner + admin, and sets it active. */
export async function createWorkspaceFor(user, name) {
  const ws = await Workspace.create({
    name,
    slug: `${slugify(name)}-${crypto.randomBytes(3).toString('hex')}`,
    owner: user._id,
  });
  await Membership.create({ workspace: ws._id, user: user._id, role: 'admin' });
  user.activeWorkspace = ws._id;
  await user.save();
  return ws;
}

export async function findValidInvite(token, email) {
  const invite = await Invite.findOne({ tokenHash: sha256(token), status: 'pending' });
  if (!invite) throw new AppError(400, 'This invite is invalid or was already used', 'INVITE_INVALID');
  if (invite.expiresAt < new Date()) {
    invite.status = 'expired';
    await invite.save();
    throw new AppError(400, 'This invite has expired', 'INVITE_EXPIRED');
  }
  if (invite.email !== email.toLowerCase()) {
    throw new AppError(403, 'This invite was sent to a different email address', 'INVITE_EMAIL_MISMATCH');
  }
  return invite;
}

/** Existing members keep their current role; only new members get the invited role. */
export async function acceptInvite(user, invite) {
  await Membership.findOneAndUpdate(
    { workspace: invite.workspace, user: user._id },
    {
      $set: { status: 'active' },
      $setOnInsert: { role: invite.role, invitedBy: invite.invitedBy },
    },
    { upsert: true },
  );
  invite.status = 'accepted';
  await invite.save();
  user.activeWorkspace = invite.workspace;
  await user.save();
  return invite.workspace;
}

export async function assertWorkspaceMember(workspaceId, userId) {
  const m = await Membership.exists({ workspace: workspaceId, user: userId, status: 'active' });
  if (!m) throw new AppError(400, 'That user is not a member of this workspace', 'NOT_A_MEMBER');
}
