-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('UP', 'DOWN', 'DEGRADED');

-- CreateTable
CREATE TABLE "AppIncident" (
    "id" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DOWN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "durationMs" BIGINT,

    CONSTRAINT "AppIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppIncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "message" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSnapshot" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalApps" INTEGER NOT NULL,
    "upCount" INTEGER NOT NULL,
    "downCount" INTEGER NOT NULL,
    "degradedCount" INTEGER NOT NULL,
    "data" JSONB,

    CONSTRAINT "MonitoringSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppIncident_appName_startedAt_idx" ON "AppIncident"("appName", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AppIncident_startedAt_idx" ON "AppIncident"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "AppIncidentEvent_incidentId_recordedAt_idx" ON "AppIncidentEvent"("incidentId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "MonitoringSnapshot_timestamp_idx" ON "MonitoringSnapshot"("timestamp" DESC);

-- AddForeignKey
ALTER TABLE "AppIncident" ADD CONSTRAINT "AppIncident_appName_fkey" FOREIGN KEY ("appName") REFERENCES "AppConfig"("pm2Name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppIncidentEvent" ADD CONSTRAINT "AppIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "AppIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
