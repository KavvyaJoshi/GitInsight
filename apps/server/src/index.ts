import { createApp } from './app';
import { config } from './config';
import { connectDb } from './db';
import { seedDemoUsers } from './seed';

await connectDb();
if (config.seedDemoUsers && !config.isProd) await seedDemoUsers();

createApp().listen(config.port, () => {
  console.log(`GitInsight API listening on http://localhost:${config.port}`);
});
