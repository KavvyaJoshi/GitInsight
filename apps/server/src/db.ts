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
  await mongoose.connect(uri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
