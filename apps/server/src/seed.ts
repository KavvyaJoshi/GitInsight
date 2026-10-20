import bcrypt from 'bcryptjs';
import { config } from './config';
import { User, type Role } from './models/User';

const DEMO_USERS: { email: string; password: string; name: string; role: Role }[] = [
  { email: 'admin@gitinsight.dev', password: 'Admin@1234', name: 'Demo Administrator', role: 'admin' },
  { email: 'user@gitinsight.dev', password: 'User@1234', name: 'Demo User', role: 'user' },
];

export async function seedDemoUsers(): Promise<void> {
  for (const demo of DEMO_USERS) {
    if (await User.exists({ email: demo.email })) continue;
    const passwordHash = await bcrypt.hash(demo.password, config.bcryptRounds);
    await User.create({ email: demo.email, name: demo.name, role: demo.role, passwordHash, hasPassword: true });
    console.log(`Seeded ${demo.role}: ${demo.email} / ${demo.password}`);
  }
}
