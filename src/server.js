import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { app } from './app.js';

await connectDB();
app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}`));
