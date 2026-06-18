-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "current_hash" TEXT,
ADD COLUMN     "previous_hash" TEXT;
