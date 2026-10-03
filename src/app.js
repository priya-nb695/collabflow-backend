import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import api from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

export const app = express();

app.set('trust proxy', 1); // correct client IP behind a proxy/load balancer
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL.split(',').map((s) => s.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.use('/api', api);
app.use(notFound);
app.use(errorHandler);
