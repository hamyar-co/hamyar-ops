-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pm2Name" TEXT NOT NULL,
    "envPath" TEXT,
    "deployCmd" TEXT,
    "repoUrl" TEXT,
    "branch" TEXT DEFAULT 'main',
    "healthUrl" TEXT,
    "domain" TEXT,
    "webhookSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "tag" TEXT,
    "commitHash" TEXT,
    "commitMsg" TEXT,
    "deployedBy" TEXT,
    "status" "DeployStatus" NOT NULL DEFAULT 'PENDING',
    "logs" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSchedule" (
    "id" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'restart',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "lastRanAt" TIMESTAMP(3),

    CONSTRAINT "AppSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_name_key" ON "AppConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_pm2Name_key" ON "AppConfig"("pm2Name");

-- CreateIndex
CREATE INDEX "AppVersion_appName_startedAt_idx" ON "AppVersion"("appName", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AppSchedule_appName_idx" ON "AppSchedule"("appName");

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_appName_fkey" FOREIGN KEY ("appName") REFERENCES "AppConfig"("pm2Name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSchedule" ADD CONSTRAINT "AppSchedule_appName_fkey" FOREIGN KEY ("appName") REFERENCES "AppConfig"("pm2Name") ON DELETE CASCADE ON UPDATE CASCADE;
