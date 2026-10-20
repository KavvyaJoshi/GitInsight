// Background worker process: runs scheduled jobs (alert evaluation) against the shared database.
// Start it alongside the API with `npm run worker` when RUN_WORKER_IN_API=false.
import { connectDb } from './db';
import { initCache } from './lib/cache';
import { startAlertScheduler } from './services/alerts.service';

await connectDb();
initCache();
startAlertScheduler();
// The scheduler's timer is unref'd so the API can exit cleanly; keep this process alive on its own.
setInterval(() => undefined, 1 << 30);
