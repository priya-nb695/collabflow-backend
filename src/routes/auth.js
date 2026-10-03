import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Membership } from '../models/Membership.js';
import { AppError } from '../utils/AppError.js';
import { validate } from '../utils/validate.js';
import { randomToken, sha256, signAccess } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { createWorkspaceFor, findValidInvite, acceptInvite } from '../services/workspaces.js';

const r = Router();

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'cf_refresh';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
};

async function startSession(req, res, user) {
  const token = randomToken(48);
  await Session.create({
    user: user._id,
    tokenHash: sha256(token),
    userAgent: req.get('user-agent'),
    ip: req.ip,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  res.cookie(COOKIE, token, { ...cookieOpts, maxAge: REFRESH_TTL_MS });
  return signAccess(user._id);
}

const password = z.string().min(8, 'Use at least 8 characters').max(128);
const email = z.string().trim().toLowerCase().email();

// A real bcrypt hash of a random string, so login takes similar time for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

r.post(
  '/register',
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(80),
      email,
      password,
      inviteToken: z.string().min(10).optional(),
    }),
  }),
  async (req, res) => {
    const { name, email, password, inviteToken } = req.valid.body;

    if (await User.exists({ email })) throw new AppError(409, 'An account with that email already exists', 'DUPLICATE');
    // Validate the invite BEFORE creating the account.
    const invite = inviteToken ? await findValidInvite(inviteToken, email) : null;

    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    if (invite) await acceptInvite(user, invite);
    else await createWorkspaceFor(user, `${name.split(' ')[0]}'s Workspace`);

    const accessToken = await startSession(req, res, user);
    res.status(201).json({ user: user.toJSON(), accessToken });
  },
);

r.post(
  '/login',
  validate({ body: z.object({ email, password: z.string().min(1) }) }),
  async (req, res) => {
    const { email, password } = req.valid.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, 'Incorrect email or password', 'BAD_CREDENTIALS');

    const accessToken = await startSession(req, res, user);
    res.json({ user: user.toJSON(), accessToken });
  },
);

// Rotates the refresh token on every use.
r.post('/refresh', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  const session = token
    ? await Session.findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: new Date() } })
    : null;
  if (!session) {
    res.clearCookie(COOKIE, cookieOpts);
    throw new AppError(401, 'Session expired, please sign in again', 'SESSION_EXPIRED');
  }
  const user = await User.findById(session.user);
  if (!user) throw new AppError(401, 'Account no longer exists', 'UNAUTHENTICATED');

  const next = randomToken(48);
  session.tokenHash = sha256(next);
  session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await session.save();
  res.cookie(COOKIE, next, { ...cookieOpts, maxAge: REFRESH_TTL_MS });

  res.json({ user: user.toJSON(), accessToken: signAccess(user._id) });
});

r.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) await Session.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
  res.clearCookie(COOKIE, cookieOpts);
  res.json({ ok: true });
});

r.post('/forgot-password', validate({ body: z.object({ email }) }), async (req, res) => {
  const user = await User.findOne({ email: req.valid.body.email });
  let devResetLink;
  if (user) {
    const raw = randomToken(32);
    user.resetTokenHash = sha256(raw);
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    const link = `${env.CLIENT_URL.split(',')[0]}/reset-password?token=${raw}`;
    // TODO: send this by email (Resend / Nodemailer / SES). Until then it is logged in dev.
    if (env.NODE_ENV !== 'production') {
      console.log('[dev] password reset link:', link);
      devResetLink = link;
    }
  }
  // Same response whether or not the account exists (no user enumeration).
  res.json({ ok: true, ...(devResetLink && { devResetLink }) });
});

r.post(
  '/reset-password',
  validate({ body: z.object({ token: z.string().min(10), password }) }),
  async (req, res) => {
    const { token, password } = req.valid.body;
    const user = await User.findOne({
      resetTokenHash: sha256(token),
      resetTokenExpires: { $gt: new Date() },
    }).select('+passwordHash +resetTokenHash +resetTokenExpires');
    if (!user) throw new AppError(400, 'This reset link is invalid or has expired', 'RESET_INVALID');

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() }); // sign out everywhere
    res.json({ ok: true });
  },
);

r.get('/me', requireAuth, async (req, res) => {
  const memberships = await Membership.find({ user: req.user._id, status: 'active' }).populate('workspace', 'name slug logoUrl');
  res.json({
    user: req.user.toJSON(),
    workspaces: memberships.map((m) => ({ ...m.workspace.toJSON(), role: m.role })),
  });
});

export default r;
