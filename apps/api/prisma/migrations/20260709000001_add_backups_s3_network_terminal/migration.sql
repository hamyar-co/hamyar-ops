-- AlterTable: add deployPath + container/db fields to AppConfig
ALTER TABLE "AppConfig" ADD COLUMN "deployPath" TEXT;
ALTER TABLE "AppConfig" ADD COLUMN "containerName" TEXT;
ALTER TABLE "AppConfig" ADD COLUMN "dbType" TEXT;
ALTER TABLE "AppConfig" ADD COLUMN "dbName" TEXT;

-- CreateTable
CREATE TABLE "S3Config" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'default',
    "bucket" TEXT NOT NULL,
    "accessKeyId" TEXT NOT NULL,
    "secretAccessKey" TEXT NOT NULL,
    "usePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "S3Config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "S3Config_name_key" ON "S3Config"("name");

-- CreateTable
CREATE TABLE "BackupStrategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storage" TEXT NOT NULL DEFAULT 'local',
    "s3ConfigId" TEXT,
    "scheduleCron" TEXT NOT NULL,
    "retentionMax" INTEGER NOT NULL DEFAULT 24,
    "excludeNodeModules" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupStrategy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupStrategy_s3ConfigId_idx" ON "BackupStrategy"("s3ConfigId");

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'local',
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL,
    "localPath" TEXT,
    "s3Key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackupRecord_targetType_targetName_createdAt_idx" ON "BackupRecord"("targetType", "targetName", "createdAt" DESC);
CREATE INDEX "BackupRecord_strategyId_idx" ON "BackupRecord"("strategyId");
CREATE INDEX "BackupRecord_expiresAt_idx" ON "BackupRecord"("expiresAt");

-- CreateTable
CREATE TABLE "NetworkRule" (
    "id" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'tcp',
    "action" TEXT NOT NULL DEFAULT 'DENY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NetworkRule_port_protocol_key" ON "NetworkRule"("port", "protocol");

-- AddForeignKey
ALTER TABLE "BackupStrategy" ADD CONSTRAINT "BackupStrategy_s3ConfigId_fkey" FOREIGN KEY ("s3ConfigId") REFERENCES "S3Config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupRecord" ADD CONSTRAINT "BackupRecord_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "BackupStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;