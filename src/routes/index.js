import { Router } from 'express';
import auth from './auth.js';
import workspaces from './workspaces.js';
import members from './members.js';
import invites from './invites.js';
import projects from './projects.js';
import tasks from './tasks.js';
import comments from './comments.js';
import dashboard from './dashboard.js';

const api = Router();
api.get('/health', (_req, res) => res.json({ ok: true }));
api.use('/auth', auth);
api.use('/workspaces', workspaces);
api.use('/members', members);
api.use('/invites', invites);
api.use('/projects', projects);
api.use('/tasks', tasks);
api.use('/comments', comments);
api.use('/dashboard', dashboard);

export default api;
