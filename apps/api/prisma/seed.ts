import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@hamyar.app',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log('✓ admin user seeded (password: admin123)');
  console.log('IMPORTANT: Change the admin password immediately after first login.');

  // Default AppConfigs
  const defaultApps = [
    {
      name: 'Hamyar Backend',
      pm2Name: 'hamyar-backend',
      domain: 'api.hamyar.app',
      healthUrl: 'https://api.hamyar.app/v1/health',
      envPath: '/opt/hamyar/backend/.env',
      repoUrl: null,
      branch: 'main',
      deployCmd: null,
    },
    {
      name: 'Hamyar Panel',
      pm2Name: 'hamyar-panel',
      domain: 'panel.hamyar.app',
      healthUrl: null,
      envPath: '/opt/hamyar/panel/.env',
      repoUrl: null,
      branch: 'main',
      deployCmd: null,
    },
    {
      name: 'Hamyar Main',
      pm2Name: 'hamyar-main',
      domain: 'hamyar.app',
      healthUrl: null,
      envPath: '/opt/hamyar/main/.env',
      repoUrl: null,
      branch: 'main',
      deployCmd: null,
    },
    {
      name: 'Ops API',
      pm2Name: 'hamyar-ops-api',
      domain: 'ops.hamyar.app',
      healthUrl: 'https://ops.hamyar.app/api/monitoring/health',
      envPath: '/opt/hamyar/ops/api/.env',
      repoUrl: null,
      branch: 'main',
      deployCmd: null,
    },
    {
      name: 'Ops UI',
      pm2Name: 'hamyar-ops-ui',
      domain: 'ops.hamyar.app',
      healthUrl: null,
      envPath: '/opt/hamyar/ops/web/apps/web/.env',
      repoUrl: null,
      branch: 'main',
      deployCmd: null,
    },
  ];

  for (const app of defaultApps) {
    await prisma.appConfig.upsert({
      where: { pm2Name: app.pm2Name },
      update: {},
      create: {
        ...app,
        webhookSecret: crypto.randomBytes(24).toString('hex'),
      },
    });
    console.log(`✓ AppConfig seeded: ${app.name} (${app.pm2Name})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
