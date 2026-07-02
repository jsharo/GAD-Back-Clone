-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "blockchain_anchored_at" TIMESTAMP(3),
ADD COLUMN     "blockchain_contract_address" TEXT,
ADD COLUMN     "blockchain_evidence_id" TEXT,
ADD COLUMN     "blockchain_network" TEXT,
ADD COLUMN     "blockchain_status" TEXT DEFAULT 'PENDING',
ADD COLUMN     "blockchain_tx_hash" TEXT;
