import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from './config';

let memoryServer: MongoMemoryServer | undefined;

export async function connectDb(uri = config.mongoUri): Promise<void> {
  if (!uri) {
    if (config.isProd) throw new Error('MONGODB_URI is required in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    if (!config.isTest) console.warn('MONGODB_URI not set: using in-memory MongoDB (data is lost on restart)');
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  } catch (err) {
    const message = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}` : String(err);
    if (/tlsv1 alert internal error|SSL alert number 80|whitelist|not authorized to access/i.test(message)) {
      console.error(
        'Could not connect to MongoDB: the database refused this server\'s IP address.\n' +
          'In MongoDB Atlas, open Network Access and allow this server (on Render: "Allow access from anywhere", 0.0.0.0/0).',
      );
    } else if (/bad auth|Authentication failed/i.test(message)) {
      console.error('Could not connect to MongoDB: wrong username or password in MONGODB_URI.');
    }
    throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
