-- CreateTable
CREATE TABLE "AnalyticsSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogFileState" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "byteOffset" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogFileState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRequest" (
    "id" TEXT NOT NULL,
    "ip" TEXT,
    "method" TEXT,
    "url" TEXT,
    "status" INTEGER,
    "userAgent" TEXT,
    "referer" TEXT,
    "size" INTEGER,
    "botScore" INTEGER NOT NULL DEFAULT 0,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsMinuteStat" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bandwidth" BIGINT NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "botCount" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsMinuteStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsHourStat" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bandwidth" BIGINT NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "botCount" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsHourStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDayStat" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bandwidth" BIGINT NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "botCount" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDayStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsVisitor" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "isBot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalyticsVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSetting_key_key" ON "AnalyticsSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LogFileState_filePath_key" ON "LogFileState"("filePath");

-- CreateIndex
CREATE INDEX "RawRequest_timestamp_idx" ON "RawRequest"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "RawRequest_isBot_idx" ON "RawRequest"("isBot");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsMinuteStat_timestamp_key" ON "AnalyticsMinuteStat"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsHourStat_timestamp_key" ON "AnalyticsHourStat"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDayStat_timestamp_key" ON "AnalyticsDayStat"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsVisitor_ip_key" ON "AnalyticsVisitor"("ip");

-- RenameIndex
ALTER INDEX "AlertRule_appName_index" RENAME TO "AlertRule_appName_idx";

-- RenameIndex
ALTER INDEX "ErrorLog_fingerprint_index" RENAME TO "ErrorLog_fingerprint_idx";

-- RenameIndex
ALTER INDEX "ErrorLog_source_sourceName_timestamp_index" RENAME TO "ErrorLog_source_sourceName_timestamp_idx";

-- RenameIndex
ALTER INDEX "ErrorLog_timestamp_index" RENAME TO "ErrorLog_timestamp_idx";
