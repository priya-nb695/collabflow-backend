import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workspaceContext } from '../middleware/workspace.js';
import { requireRole, atLeast } from '../utils/rbac.js';
import { validate, oid } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { randomToken, sha256 } from '../utils/tokens.js';
import { Invite } from '../models/Invite.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { findValidInvite, acceptInvite } from '../services/workspaces.js';

const r = Router();
r.use(requireAuth);

// Accept needs a signed-in user but NOT a workspace context.
r.post('/accept', validate({ body: z.object({ token: z.string().min(10) }) }), async (req, res) => {
  const invite = await findValidInvite(req.valid.body.token, req.user.email);
  const workspaceId = await acceptInvite(req.user, invite);
  res.json({ workspaceId: String(workspaceId) });
});

r.use(workspaceContext, requireRole('manager'));

r.get('/', async (req, res) => {
  const invites = await Invite.find({ workspace: req.workspaceId, status: 'pending' }).sort('-createdAt');
  res.json({ invites: invites.map((i) => i.toJSON()) });
});

r.post(
  '/',
  validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email(),
      role: z.enum(['viewer', 'developer', 'manager', 'admin']).default('developer'),
    }),
  }),
  async (req, res) => {
    const { email, role } = req.valid.body;
    if (role === 'admin' && !atLeast(req.role, 'admin')) throw new AppError(403, 'Only admins can invite admins', 'FORBIDDEN');

    const existingUser = await User.findOne({ email }).select('_id');
    if (existingUser && (await Membership.exists({ workspace: req.workspaceId, user: existingUser._id }))) {
      throw new AppError(409, 'That person is already a member', 'DUPLICATE');
    }
    if (await Invite.exists({ workspace: req.workspaceId, email, status: 'pending', expiresAt: { $gt: new Date() } })) {
      throw new AppError(409, 'An invite is already pending for that email', 'DUPLICATE');
    }

    const token = randomToken(24);
    const invite = await Invite.create({
      workspace: req.workspaceId,
      email,
      role,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: req.user._id,
    });
    // Email delivery not wired yet: return the token so the UI can show a "copy invite link" button.
    res.status(201).json({ invite: invite.toJSON(), token });
  },
);

r.delete('/:id', validate({ params: z.object({ id: oid }) }), async (req, res) => {
  const invite = await Invite.findOneAndUpdate(
    { _id: req.valid.params.id, workspace: req.workspaceId, status: 'pending' },
    { status: 'revoked' },
  );
  if (!invite) throw new AppError(404, 'Invite not found', 'NOT_FOUND');
  res.json({ ok: true });
});

export default r;
