-- CreateTable
CREATE TABLE "MicroserviceProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicroserviceProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Microservice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pm2Prefix" TEXT NOT NULL,
    "deployPath" TEXT,
    "startCmd" TEXT,
    "basePort" INTEGER NOT NULL DEFAULT 3000,
    "targetInstances" INTEGER NOT NULL DEFAULT 1,
    "healthUrl" TEXT,
    "routePrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Microservice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicroserviceProject_name_key" ON "MicroserviceProject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Microservice_pm2Prefix_key" ON "Microservice"("pm2Prefix");

-- CreateIndex
CREATE INDEX "Microservice_projectId_idx" ON "Microservice"("projectId");

-- AddForeignKey
ALTER TABLE "Microservice" ADD CONSTRAINT "Microservice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "MicroserviceProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
