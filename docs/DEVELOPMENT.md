# Development Guide

Local development setup, code architecture, contribution guidelines, and adding new features.

---

## Table of Contents

1. [Local Setup](#1-local-setup)
2. [Project Structure](#2-project-structure)
3. [Adding a New API Module](#3-adding-a-new-api-module)
4. [Adding a New Frontend Page](#4-adding-a-new-frontend-page)
5. [Adding a Database Model](#5-adding-a-database-model)
6. [Adding Shared DTOs](#6-adding-shared-dtos)
7. [WebSocket Events](#7-websocket-events)
8. [Testing](#8-testing)
9. [Code Style](#9-code-style)
10. [Common Patterns](#10-common-patterns)

---

## 1. Local Setup

```bash
# 1. Clone
git clone https://github.com/hamyar-app/hamyar-ops.git
cd hamyar-ops

# 2. Install dependencies (workspaces: api + web + shared)
pnpm install

# 3. Start infrastructure
docker compose -f docker-compose.dev.yml up -d
# PostgreSQL → :5433
# Redis → :6380

# 4. Configure environment
cp apps/api/.env.example apps/api/.env
# The defaults work for local dev — no changes needed

# 5. Run migrations and seed admin user
cd apps/api
npx prisma migrate dev
npx ts-node prisma/seed.ts
cd ../..

# 6. Start dev servers (hot reload)
pnpm dev
# API:       http://localhost:3005
# API docs:  http://localhost:3005/api/docs  (Swagger)
# UI:        http://localhost:3004
```

**Login:** `admin` / `admin123`

---

## 2. Project Structure

```
hamyar-ops/
├── apps/
│   ├── api/                              # NestJS backend
│   │   ├── src/
│   │   │   ├── app.module.ts             # Root module (import all feature modules here)
│   │   │   ├── main.ts                   # Bootstrap, Swagger, CORS
│   │   │   ├── modules/                  # Feature modules (25+)
│   │   │   │   └── <feature>/
│   │   │   │       ├── <feature>.module.ts
│   │   │   │       ├── <feature>.service.ts
│   │   │   │       ├── <feature>.controller.ts
│   │   │   │       └── <feature>.processor.ts  (if BullMQ)
│   │   │   ├── infrastructure/
│   │   │   │   ├── prisma/               # Global PrismaService
│   │   │   │   ├── redis/                # Global RedisService
│   │   │   │   ├── ssh/                  # SshService (terminal)
│   │   │   │   └── events/               # DeployEventBus
│   │   │   ├── gateways/
│   │   │   │   └── events.gateway.ts     # Socket.IO WebSocket gateway
│   │   │   └── common/
│   │   │       ├── decorators/           # @Roles(), @Public(), @CurrentUser()
│   │   │       ├── guards/               # JwtAuthGuard, RolesGuard
│   │   │       ├── filters/              # GlobalExceptionFilter
│   │   │       └── interceptors/         # AuditLogInterceptor
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       ├── migrations/
│   │       └── seed.ts
│   └── web/                              # Next.js 15 frontend
│       └── src/
│           ├── app/
│           │   ├── (auth)/login/         # Login page
│           │   └── (dashboard)/          # Protected dashboard pages
│           ├── components/
│           │   ├── layout/               # Sidebar, Header, responsive wrappers
│           │   ├── shared/               # StatusBadge, ConfirmDialog
│           │   └── charts/               # MetricCard, charts
│           ├── hooks/
│           │   └── useSocket.ts          # Socket.IO hook
│           ├── lib/
│           │   ├── api.ts                # Axios client
│           │   ├── socket.ts             # Socket.IO singleton
│           │   └── format.ts             # formatBytes, formatUptime
│           └── stores/
│               ├── auth.store.ts         # JWT + user state (Zustand)
│               └── sidebar.store.ts      # Sidebar collapse state
└── packages/
    └── shared/                           # Shared TypeScript types
        └── src/
            ├── dto/                      # Type definitions
            │   ├── index.ts              # Re-export all DTOs
            │   └── *.dto.ts
            └── events/
                └── socket.events.ts      # WsEvents constants
```

---

## 3. Adding a New API Module

Follow the existing multi-server module pattern exactly.

### Step 1: Create module files

```bash
mkdir apps/api/src/modules/my-feature
```

**`my-feature.module.ts`:**
```typescript
import { Module } from '@nestjs/common';
import { MyFeatureController } from './my-feature.controller';
import { MyFeatureService } from './my-feature.service';

@Module({
  controllers: [MyFeatureController],
  providers: [MyFeatureService],
  exports: [MyFeatureService],
})
export class MyFeatureModule {}
```

**`my-feature.service.ts`:**
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class MyFeatureService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.myModel.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
```

**`my-feature.controller.ts`:**
```typescript
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MyFeatureService } from './my-feature.service';

@Controller('my-feature')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MyFeatureController {
  constructor(private service: MyFeatureService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: any) {
    return this.service.create(dto);
  }
}
```

### Step 2: Register in app.module.ts

```typescript
import { MyFeatureModule } from './modules/my-feature/my-feature.module';

@Module({
  imports: [
    // ... existing modules
    MyFeatureModule,
  ],
})
export class AppModule {}
```

### Step 3 (if BullMQ): Register queue

```typescript
// In my-feature.module.ts:
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'my-feature' })],
  // ...
})
```

---

## 4. Adding a New Frontend Page

### Step 1: Create the page

```bash
mkdir apps/web/src/app/\(dashboard\)/my-page
touch apps/web/src/app/\(dashboard\)/my-page/page.tsx
```

**`page.tsx` template:**
```typescript
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { Card, Grid, ResponsiveTable } from '@/components/layout/ResponsiveComponents';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { WsEvents } from '@hamyar-ops/shared';

export default function MyPage() {
  const { socket } = useSocket();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['my-feature'],
    queryFn: () => apiClient.get('/my-feature').then(r => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">My Feature</h1>
      </div>

      <Card>
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((item: any) => (
              <tr key={item.id} className="hover:bg-surface-2 transition-colors">
                <td className="px-4 py-3 text-sm text-foreground">{item.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </Card>
    </div>
  );
}
```

### Step 2: Add to sidebar

```typescript
// apps/web/src/components/layout/Sidebar.tsx
const NAV_ITEMS = [
  // ... existing items
  { href: '/my-page', label: 'My Feature', icon: '⚙' },
];
```

---

## 5. Adding a Database Model

### Step 1: Add to schema.prisma

```prisma
// apps/api/prisma/schema.prisma
model MyModel {
  id        String   @id @default(cuid())
  name      String   @unique
  data      Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([name])
}
```

### Step 2: Create migration

```bash
cd apps/api
npx prisma migrate dev --name add_my_model
# Generates: prisma/migrations/YYYYMMDDHHMMSS_add_my_model/migration.sql
```

### Step 3: Regenerate Prisma client

```bash
npx prisma generate
```

The `PrismaService` now has `prisma.myModel.findMany()` etc.

---

## 6. Adding Shared DTOs

```typescript
// packages/shared/src/dto/my-feature.dto.ts
export interface MyModelDto {
  id: string;
  name: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMyModelDto {
  name: string;
  data?: Record<string, unknown>;
}
```

Export from index:
```typescript
// packages/shared/src/dto/index.ts
export * from './my-feature.dto';
```

Rebuild shared package:
```bash
pnpm --filter @hamyar-ops/shared build
```

---

## 7. WebSocket Events

### Add a new event type

```typescript
// packages/shared/src/events/socket.events.ts
export const WsEvents = {
  // ... existing events
  MY_FEATURE_UPDATE: 'my-feature:update',
} as const;
```

### Emit from a service

```typescript
// In your NestJS service:
import { DeployEventBus } from '../../infrastructure/events/deploy-event-bus.service';
import { WsEvents } from '@hamyar-ops/shared';

constructor(private eventBus: DeployEventBus) {}

async doSomething() {
  // ... logic
  this.eventBus.emit(WsEvents.MY_FEATURE_UPDATE, { id: 'xxx', status: 'done' });
}
```

### Listen in EventsGateway

The `EventsGateway` automatically broadcasts all `DeployEventBus` events to connected clients. Just emit the event — it will be received by all browsers.

### Subscribe in frontend

```typescript
// In your page component:
useEffect(() => {
  if (!socket) return;
  socket.on(WsEvents.MY_FEATURE_UPDATE, (data) => {
    // Update local state
    qc.invalidateQueries({ queryKey: ['my-feature'] });
  });
  return () => { socket.off(WsEvents.MY_FEATURE_UPDATE); };
}, [socket, qc]);
```

---

## 8. Testing

```bash
# Run API tests
pnpm --filter @hamyar-ops/api test

# Run with coverage
pnpm --filter @hamyar-ops/api test:cov

# Type-check everything
pnpm --filter @hamyar-ops/api typecheck
pnpm --filter @hamyar-ops/web typecheck

# Lint
pnpm lint
```

### Example service test

```typescript
// apps/api/src/modules/my-feature/my-feature.service.spec.ts
import { Test } from '@nestjs/testing';
import { MyFeatureService } from './my-feature.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

describe('MyFeatureService', () => {
  let service: MyFeatureService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MyFeatureService,
        {
          provide: PrismaService,
          useValue: {
            myModel: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(MyFeatureService);
    prisma = module.get(PrismaService);
  });

  it('lists models', async () => {
    const result = await service.list();
    expect(result).toEqual([]);
    expect(prisma.myModel.findMany).toHaveBeenCalled();
  });
});
```

---

## 9. Code Style

### TypeScript

- Strict mode enabled
- No `any` types (use proper interfaces from `@hamyar-ops/shared`)
- Always handle errors with try/catch in services
- Clean up temp files in `finally` blocks (SSH keys, Ansible inventory files)

### NestJS patterns

```typescript
// ✅ Correct: inject via constructor
constructor(private prisma: PrismaService) {}

// ✅ Correct: throw NestJS exceptions
throw new NotFoundException('Server not found');
throw new BadRequestException('Built-in playbook cannot be deleted');

// ✅ Correct: use @Roles for ADMIN-only routes
@Post()
@Roles('ADMIN')
create(@Body() dto: CreateDto) {}

// ✅ Correct: validate input with class-validator
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
```

### Frontend patterns

```typescript
// ✅ Correct: always 'use client' for dashboard pages
'use client';

// ✅ Correct: use apiClient, not fetch
const data = await apiClient.get('/endpoint').then(r => r.data);

// ✅ Correct: invalidate query cache after mutation
const qc = useQueryClient();
onSuccess: () => qc.invalidateQueries({ queryKey: ['my-feature'] })

// ✅ Correct: Tailwind with custom vars
className="bg-surface border border-border text-foreground"
className="text-muted-foreground hover:text-foreground"
className="bg-primary text-primary-foreground"
className="text-error" // for errors
className="text-success" // for success
```

---

## 10. Common Patterns

### Long-running task with BullMQ + WebSocket

```typescript
// Service: queue the job
async triggerTask(id: string) {
  const record = await this.prisma.myModel.create({ data: { status: 'PENDING' } });
  await this.queue.add('run', { recordId: record.id });
  return record;
}

// Service: execute (called by processor)
async executeTask(recordId: string) {
  await this.prisma.myModel.update({ where: { id: recordId }, data: { status: 'RUNNING' } });
  try {
    const proc = spawn('some-command', ['--arg']);
    for await (const line of proc.stdout) {
      this.eventBus.emit('my-feature:log', { recordId, line: line.toString() });
    }
    await this.prisma.myModel.update({ where: { id: recordId }, data: { status: 'SUCCESS' } });
    this.eventBus.emit('my-feature:done', { recordId, status: 'SUCCESS' });
  } catch (err) {
    await this.prisma.myModel.update({ where: { id: recordId }, data: { status: 'FAILED' } });
    this.eventBus.emit('my-feature:done', { recordId, status: 'FAILED' });
  }
}
```

### SSH execution

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

async runOnServer(server: ManagedServer, command: string) {
  const keyFile = path.join(os.tmpdir(), `key-${Date.now()}`);
  try {
    const sshKey = await this.prisma.sshKey.findUnique({ where: { id: server.sshKeyId } });
    fs.writeFileSync(keyFile, sshKey.privateKey, { mode: 0o600 });

    const { stdout, stderr } = await execFileAsync('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=30',
      '-i', keyFile,
      '-p', String(server.port),
      `${server.username}@${server.host}`,
      command,
    ]);
    return { success: true, output: stdout, error: stderr };
  } finally {
    try { fs.unlinkSync(keyFile); } catch {}
  }
}
```
