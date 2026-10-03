# CollabFlow API (MERN backend)

Node 20+ · Express 5 · MongoDB (Mongoose 8) · Zod · JWT + rotating refresh cookie

## Run it
```bash
cd collabflow-api
npm install
cp .env.example .env      # set MONGODB_URI and a 32+ char JWT_ACCESS_SECRET
npm run dev               # http://localhost:4000/api/health
```
MongoDB: local (`mongod`) or a free MongoDB Atlas cluster.
In your React app set `VITE_API_URL=http://localhost:4000/api` and copy `frontend/api.ts`.
`CLIENT_URL` in `.env` must equal your React dev origin (CORS + cookies).

## How auth works
1. `POST /auth/register` or `/auth/login` -> returns `{ user, accessToken }` and sets an httpOnly `cf_refresh` cookie.
2. Send `Authorization: Bearer <accessToken>` (15 min). Keep it in memory, not localStorage.
3. On 401 call `POST /auth/refresh` (cookie) -> new access token; the refresh token rotates each time.
4. `POST /auth/logout` revokes the session.

## Workspace scoping + roles
Every route except `/auth/*` and `/workspaces` (list/create/switch) needs a workspace: send header
`x-workspace-id: <id>` (or it falls back to the user's active workspace). The server loads the caller's
Membership and enforces `viewer < developer < manager < admin`. A non-member gets 403 for anything.

| Role | Can |
|---|---|
| viewer | read everything |
| developer | + create/edit tasks, comments |
| manager | + create/edit projects, invite members, delete any task/comment |
| admin | + change roles, remove members, edit workspace, delete projects |

## Endpoints (all under /api)
| Area | Routes |
|---|---|
| Auth | POST /auth/register, /login, /refresh, /logout, /forgot-password, /reset-password · GET /auth/me |
| Workspaces | GET / · POST / · POST /switch · GET,PATCH /current |
| Members | GET / · PATCH /:id {role} · DELETE /:id |
| Invites | GET / · POST / {email, role} · DELETE /:id · POST /accept {token} |
| Projects | GET / · POST / · GET,PATCH /:id · POST /:id/archive · DELETE /:id · GET,POST /:id/members |
| Tasks | GET / (?projectId&status&assigneeId&priority&search) · GET /mine · POST / · GET,PATCH,DELETE /:id · PATCH /:id/move · GET /:id/activity · GET,POST /:id/comments |
| Comments | PATCH,DELETE /comments/:id |
| Dashboard | GET /dashboard |

Errors always look like `{ "error": { "message", "code", "fields?" } }`.

## Known gaps (next phases)
- Invite + password-reset **emails are not sent**. Invite create returns `token` (build link `/accept-invite?token=`);
  in dev, forgot-password returns `devResetLink` and logs it. Add Resend/Nodemailer before production.
- No chat, documents, file uploads, notifications or realtime yet (Phase 2: Socket.IO + multer + Notification model).
- No automated tests and I have not run this against a live database — run it and report any errors.
- No demo-data seed yet (needs your `data.ts` to mirror it).
