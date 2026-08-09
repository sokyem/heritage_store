/**
 * Reset or create admin password.
 *
 * Credentials come from env vars — never hardcode them (this file is
 * committed). Run it as a deliberate one-off, NOT as part of the deploy
 * start command:
 *   ADMIN_RESET_EMAIL=you@example.com ADMIN_RESET_PASSWORD='…' \
 *     npx tsx prisma/reset-admin-password.ts
 *
 * If the user exists, updates the password and sets role to 'founder'.
 * If the user does not exist, creates them with role='founder'.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_RESET_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_RESET_PASSWORD;

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      'Refusing to run: set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD env vars.\n' +
      'This script is a manual utility and must not be wired into the deploy start command.',
    );
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error('Refusing to run: ADMIN_RESET_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        password: hashed,
        role: 'founder',
      },
    });
    console.log(`✓ Updated password and role for existing user: ${ADMIN_EMAIL}`);
  } else {
    const user = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Admin',
        role: 'founder',
        password: hashed,
      },
    });
    console.log(`✓ Created new admin user: ${user.email} (role: ${user.role})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

