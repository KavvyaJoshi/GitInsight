import bcrypt from 'bcryptjs';
import { config } from './config';
import { User, type Role } from './models/User';

const DEMO_USERS: { email: string; password: string; name: string; role: Role }[] = [
  { email: 'admin@gitinsight.dev', password: 'Admin@1234', name: 'Demo Administrator', role: 'admin' },
  { email: 'user@gitinsight.dev', password: 'User@1234', name: 'Demo User', role: 'user' },
];

/** Demo accounts whose passwords are public in the source code. */
export const DEMO_EMAILS = new Set(DEMO_USERS.map((u) => u.email));

/** True when this is a demo account and the environment doesn't allow them (production by default). */
export const isBlockedDemoAccount = (email: string) => !config.allowDemoAccounts && DEMO_EMAILS.has(email);

export async function seedDemoUsers(): Promise<void> {
  for (const demo of DEMO_USERS) {
    if (await User.exists({ email: demo.email })) continue;
    const passwordHash = await bcrypt.hash(demo.password, config.bcryptRounds);
    await User.create({ email: demo.email, name: demo.name, role: demo.role, passwordHash, hasPassword: true });
    console.log(`Seeded ${demo.role}: ${demo.email} / ${demo.password}`);
  }
}
