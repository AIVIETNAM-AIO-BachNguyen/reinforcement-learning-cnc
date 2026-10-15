const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const output = process.env.OPERATIONS_E2E_USERS_FILE;
  const password = process.env.OPERATIONS_E2E_ROLE_PASSWORD;
  if (!output || !password) throw new Error('OPERATIONS_E2E_USERS_FILE and OPERATIONS_E2E_ROLE_PASSWORD are required');
  const passwordHash = await bcrypt.hash(password, 12);
  const users = {};
  for (const [key, username] of [['viewer', 'operations_e2e_viewer'], ['outsider', 'operations_e2e_outsider']]) {
    users[key] = await prisma.user.create({ data: {
      username,
      fullName: `Operations E2E ${key}`,
      email: `${username}@example.test`,
      passwordHash,
      role: 'VIEWER',
      active: true,
    }, select: { id: true, username: true, role: true } });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(users, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
