-- AlterTable: scope alerts to an application (null = server-wide)
ALTER TABLE "AlertRule" ADD COLUMN "appName" TEXT;

-- CreateIndex
CREATE INDEX "AlertRule_appName_index" ON "AlertRule"("appName");

-- CreateTable: centralized error-log aggregator
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fullLine" TEXT NOT NULL,
    "route" TEXT,
    "stackSnippet" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_source_sourceName_timestamp_index" ON "ErrorLog"("source", "sourceName", "timestamp" DESC);
CREATE INDEX "ErrorLog_fingerprint_index" ON "ErrorLog"("fingerprint");
CREATE INDEX "ErrorLog_timestamp_index" ON "ErrorLog"("timestamp" DESC);