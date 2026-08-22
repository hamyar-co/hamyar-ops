-- CreateTable: Terraform workspace management
CREATE TABLE "TerraformWorkspace" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "workingDir"   TEXT NOT NULL,
    "stateBackend" TEXT NOT NULL DEFAULT 's3',
    "s3ConfigId"   TEXT,
    "s3Key"        TEXT,
    "variables"    JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraformWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraformWorkspace_name_key" ON "TerraformWorkspace"("name");
CREATE INDEX "TerraformWorkspace_name_idx" ON "TerraformWorkspace"("name");

-- CreateTable: Terraform run history
CREATE TABLE "TerraformRun" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "command"     TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'PENDING',
    "output"      TEXT,
    "planSummary" JSONB,
    "triggeredBy" TEXT,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"  TIMESTAMP(3),

    CONSTRAINT "TerraformRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TerraformRun_workspaceId_startedAt_idx" ON "TerraformRun"("workspaceId", "startedAt" DESC);

ALTER TABLE "TerraformRun"
    ADD CONSTRAINT "TerraformRun_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "TerraformWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Ansible playbooks
CREATE TABLE "AnsiblePlaybook" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "content"     TEXT NOT NULL,
    "targetTags"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "variables"   JSONB,
    "builtIn"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnsiblePlaybook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnsiblePlaybook_name_key" ON "AnsiblePlaybook"("name");
CREATE INDEX "AnsiblePlaybook_name_idx" ON "AnsiblePlaybook"("name");

-- CreateTable: Ansible job runs
CREATE TABLE "AnsibleJob" (
    "id"          TEXT NOT NULL,
    "playbookId"  TEXT NOT NULL,
    "serverIds"   TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"      TEXT NOT NULL DEFAULT 'PENDING',
    "output"      TEXT,
    "driftReport" JSONB,
    "triggeredBy" TEXT,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"  TIMESTAMP(3),

    CONSTRAINT "AnsibleJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnsibleJob_playbookId_startedAt_idx" ON "AnsibleJob"("playbookId", "startedAt" DESC);

ALTER TABLE "AnsibleJob"
    ADD CONSTRAINT "AnsibleJob_playbookId_fkey"
    FOREIGN KEY ("playbookId") REFERENCES "AnsiblePlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Deploy pipelines
CREATE TABLE "Pipeline" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "appName"      TEXT,
    "serverId"     TEXT,
    "trigger"      TEXT NOT NULL DEFAULT 'manual',
    "webhookToken" TEXT,
    "cron"         TEXT,
    "strategy"     TEXT NOT NULL DEFAULT 'rolling',
    "buildMode"    TEXT NOT NULL DEFAULT 'ci',
    "registryId"   TEXT,
    "imageTag"     TEXT,
    "enabled"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pipeline_name_key" ON "Pipeline"("name");
CREATE UNIQUE INDEX "Pipeline_webhookToken_key" ON "Pipeline"("webhookToken");
CREATE INDEX "Pipeline_appName_idx" ON "Pipeline"("appName");
CREATE INDEX "Pipeline_webhookToken_idx" ON "Pipeline"("webhookToken");

-- CreateTable: Pipeline run instances
CREATE TABLE "PipelineRun" (
    "id"         TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'PENDING',
    "trigger"    TEXT,
    "commitSha"  TEXT,
    "branch"     TEXT,
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PipelineRun_pipelineId_startedAt_idx" ON "PipelineRun"("pipelineId", "startedAt" DESC);

ALTER TABLE "PipelineRun"
    ADD CONSTRAINT "PipelineRun_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Individual steps within a pipeline run
CREATE TABLE "PipelineStep" (
    "id"         TEXT NOT NULL,
    "runId"      TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'PENDING',
    "output"     TEXT,
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PipelineStep_runId_idx" ON "PipelineStep"("runId");

ALTER TABLE "PipelineStep"
    ADD CONSTRAINT "PipelineStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Container registry connections
CREATE TABLE "ContainerRegistry" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "url"       TEXT,
    "username"  TEXT,
    "password"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerRegistry_name_key" ON "ContainerRegistry"("name");
CREATE INDEX "ContainerRegistry_name_idx" ON "ContainerRegistry"("name");
