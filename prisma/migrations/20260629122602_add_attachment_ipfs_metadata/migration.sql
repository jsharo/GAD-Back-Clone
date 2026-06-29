-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "ipfs_cid" TEXT,
ADD COLUMN     "ipfs_provider" TEXT,
ADD COLUMN     "ipfs_status" TEXT DEFAULT 'PENDING',
ADD COLUMN     "ipfs_uploaded_at" TIMESTAMP(3);
