-- CreateTable: SSH keys for multi-server management
CREATE TABLE "SshKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT,
    "passphrase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SshKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SshKey_name_key" ON "SshKey"("name");
CREATE INDEX "SshKey_name_idx" ON "SshKey"("name");

-- CreateTable: managed remote servers
CREATE TABLE "ManagedServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "sshKeyId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3),
    "lastPingOk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedServer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedServer_name_key" ON "ManagedServer"("name");
CREATE INDEX "ManagedServer_isActive_idx" ON "ManagedServer"("isActive");
CREATE INDEX "ManagedServer_tags_idx" ON "ManagedServer"("tags");

-- AddForeignKey
ALTER TABLE "ManagedServer" ADD CONSTRAINT "ManagedServer_sshKeyId_fkey"
    FOREIGN KEY ("sshKeyId") REFERENCES "SshKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
