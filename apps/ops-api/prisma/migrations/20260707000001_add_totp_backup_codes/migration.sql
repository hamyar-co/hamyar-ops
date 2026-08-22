-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpBackupCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
