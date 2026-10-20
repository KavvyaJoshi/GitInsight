import { createApp } from './app';
import { config } from './config';
import { connectDb } from './db';
import { initCache } from './lib/cache';
import { seedDemoUsers } from './seed';
import { startAlertScheduler } from './services/alerts.service';

await connectDb();
initCache();
if (config.seedDemoUsers && !config.isProd) await seedDemoUsers();
if (config.runWorkerInApi) startAlertScheduler();

createApp().listen(config.port, () => {
  console.log(`GitInsight API listening on http://localhost:${config.port}`);
});
