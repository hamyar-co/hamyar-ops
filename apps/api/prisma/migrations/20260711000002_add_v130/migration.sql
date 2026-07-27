-- v1.3.0 migration: Fleet Control, Events, Cron, Supervisor, SSH Access, GitHub

-- AppConfig: add optional serverId column
ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "serverId" TEXT;

-- Event table: central ops audit log
CREATE TABLE "Event" (
    "id"          TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "metadata"    JSONB,
    "serverId"    TEXT,
    "serverName"  TEXT,
    "appName"     TEXT,
    "userId"      TEXT,
    "severity"    TEXT NOT NULL DEFAULT 'INFO',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt" DESC);
CREATE INDEX "Event_type_idx" ON "Event"("type");
CREATE INDEX "Event_serverId_idx" ON "Event"("serverId");
CREATE INDEX "Event_appName_idx" ON "Event"("appName");
CREATE INDEX "Event_userId_idx" ON "Event"("userId");

-- CronJob table
CREATE TABLE "CronJob" (
    "id"             TEXT NOT NULL,
    "serverId"       TEXT,
    "title"          TEXT NOT NULL,
    "command"        TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt"      TIMESTAMP(3),
    "lastRunOutput"  TEXT,
    "lastRunStatus"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CronJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronJob_serverId_idx" ON "CronJob"("serverId");

-- SupervisorRule table
CREATE TABLE "SupervisorRule" (
    "id"           TEXT NOT NULL,
    "serverId"     TEXT,
    "appName"      TEXT NOT NULL,
    "appType"      TEXT NOT NULL,
    "autoRestart"  BOOLEAN NOT NULL DEFAULT true,
    "enabled"      BOOLEAN NOT NULL DEFAULT true,
    "lastCheckAt"  TIMESTAMP(3),
    "lastStatus"   TEXT,
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupervisorRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupervisorRule_serverId_idx" ON "SupervisorRule"("serverId");
CREATE INDEX "SupervisorRule_enabled_idx" ON "SupervisorRule"("enabled");

-- UserSshKey table
CREATE TABLE "UserSshKey" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSshKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSshKey_userId_idx" ON "UserSshKey"("userId");

-- GithubConnection table
CREATE TABLE "GithubConnection" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "accessToken"  TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "githubLogin"  TEXT NOT NULL,
    "avatarUrl"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GithubConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GithubConnection_userId_key" ON "GithubConnection"("userId");
