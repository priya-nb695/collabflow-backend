/**
 * Seeds one demo workspace with the projects/tasks/members from the mock
 * src/components/collabflow/data.ts, so a fresh login looks familiar.
 *
 * Usage:  node scripts/seed.js
 * Safe to re-run: it wipes only the "Acme Studio" demo workspace it owns,
 * then recreates it. Does not touch any other workspace.
 *
 * Demo login after seeding:
 *   priya@acme.co / password123   (admin / workspace owner)
 *   rahul@acme.co / password123   (developer)
 *   emma@acme.co  / password123   (manager)
 *   ankit@acme.co / password123   (developer)
 *   john@acme.co  / password123   (viewer)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';
import { Membership } from '../src/models/Membership.js';
import { Project } from '../src/models/Project.js';
import { Task } from '../src/models/Task.js';
import { Channel } from '../src/models/Channel.js';
import { ChannelMember } from '../src/models/ChannelMember.js';
import { Activity } from '../src/models/Activity.js';

const DEMO_PASSWORD = 'password123';
const WORKSPACE_SLUG = 'acme-studio-demo';

// From data.ts
const PEOPLE = [
  { name: 'Priya Nair', email: 'priya@acme.co', role: 'admin' },
  { name: 'Rahul Verma', email: 'rahul@acme.co', role: 'developer' },
  { name: 'Emma Cole', email: 'emma@acme.co', role: 'manager' },
  { name: 'Ankit Rao', email: 'ankit@acme.co', role: 'developer' },
  { name: 'John Park', email: 'john@acme.co', role: 'viewer' },
];

const PROJECTS = [
  { key: 'WEB', name: 'Website Redesign', description: 'Refresh the marketing site and core conversion flows.', status: 'active', members: ['Rahul Verma', 'Emma Cole', 'Ankit Rao'] },
  { key: 'MOB', name: 'Mobile Application', description: 'Ship v2.0 with offline sync and project chat.', status: 'active', members: ['John Park', 'Priya Nair'] },
  { key: 'BOT', name: 'AI Chatbot', description: 'Conversational support connected to the knowledge base.', status: 'active', members: ['Emma Cole', 'Rahul Verma'] },
  { key: 'ADM', name: 'Admin Dashboard', description: 'Internal analytics, permissions, and role management.', status: 'planning', members: ['Ankit Rao', 'John Park'] },
];

// title, projectKey, status, priority, due (days from today), assignee
const TASKS = [
  ['Create Login Page', 'WEB', 'in_progress', 'high', 14, 'Priya Nair'],
  ['Integrate Authentication API', 'MOB', 'review', 'high', 12, 'Rahul Verma'],
  ['Design Dashboard', 'ADM', 'in_progress', 'medium', 18, 'Emma Cole'],
  ['Fix Mobile Navigation', 'MOB', 'todo', 'low', 21, 'Ankit Rao'],
  ['Review Payment API', 'WEB', 'done', 'high', -3, 'John Park'],
];

async function run() {
  await connectDB();

  // --- wipe only this demo workspace, if it already exists ---
  const old = await Workspace.findOne({ slug: WORKSPACE_SLUG });
  if (old) {
    await Promise.all([
      Task.deleteMany({ workspace: old._id }),
      Activity.deleteMany({ workspace: old._id }),
      Membership.deleteMany({ workspace: old._id }),
      ChannelMember.deleteMany({ channel: { $in: (await Channel.find({ workspace: old._id }).select('_id')).map((c) => c._id) } }),
      Channel.deleteMany({ workspace: old._id }),
      Project.deleteMany({ workspace: old._id }),
    ]);
    await old.deleteOne();
    console.log('Removed previous demo workspace');
  }

  // --- users (upsert so re-running doesn't duplicate people across workspaces) ---
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userByName = new Map();
  for (const p of PEOPLE) {
    const user = await User.findOneAndUpdate(
      { email: p.email },
      { $setOnInsert: { name: p.name, email: p.email, passwordHash } },
      { upsert: true, new: true },
    );
    userByName.set(p.name, user);
  }
  const owner = userByName.get('Priya Nair');

  // --- workspace + memberships ---
  const workspace = await Workspace.create({ name: 'Acme Studio', slug: WORKSPACE_SLUG, owner: owner._id });
  for (const p of PEOPLE) {
    await Membership.create({ workspace: workspace._id, user: userByName.get(p.name)._id, role: p.role });
  }
  await User.updateMany({ _id: { $in: [...userByName.values()].map((u) => u._id) } }, { activeWorkspace: workspace._id });

  // --- #general channel ---
  const general = await Channel.create({ workspace: workspace._id, name: 'general', description: 'Company-wide announcements', createdBy: owner._id });
  await ChannelMember.insertMany([...userByName.values()].map((u) => ({ channel: general._id, user: u._id })));

  // --- projects (+ per-project channel + members) ---
  const projectByKey = new Map();
  for (const p of PROJECTS) {
    const project = await Project.create({
      workspace: workspace._id,
      key: p.key,
      name: p.name,
      description: p.description,
      status: p.status,
      createdBy: owner._id,
      startDate: new Date(Date.now() - 14 * 86400000),
      dueDate: new Date(Date.now() + 30 * 86400000),
      members: p.members.map((name) => ({ user: userByName.get(name)._id, role: 'developer' })),
    });
    projectByKey.set(p.key, project);

    const ch = await Channel.create({ workspace: workspace._id, project: project._id, name: p.key.toLowerCase(), createdBy: owner._id });
    await ChannelMember.insertMany(p.members.map((name) => ({ channel: ch._id, user: userByName.get(name)._id })));
  }

  // --- tasks ---
  let position = 1000;
  for (const [title, key, status, priority, dueOffsetDays, assigneeName] of TASKS) {
    const project = projectByKey.get(key);
    project.taskCounter += 1;
    await project.save();

    const assignee = userByName.get(assigneeName);
    const task = await Task.create({
      workspace: workspace._id,
      project: project._id,
      number: project.taskCounter,
      title,
      status,
      priority,
      assignee: assignee._id,
      reporter: owner._id,
      dueDate: new Date(Date.now() + dueOffsetDays * 86400000),
      position: (position += 1000),
      completedAt: status === 'done' ? new Date() : null,
    });
    await Activity.create({ workspace: workspace._id, project: project._id, task: task._id, actor: owner._id, action: 'created' });
  }

  console.log('\nSeed complete. Demo workspace: Acme Studio');
  console.log('Log in as any of:');
  for (const p of PEOPLE) console.log(`  ${p.email} / ${DEMO_PASSWORD}  (${p.role})`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});