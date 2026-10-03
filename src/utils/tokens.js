import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const signAccess = (userId) =>
  jwt.sign({ sub: String(userId) }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
export const verifyAccess = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
