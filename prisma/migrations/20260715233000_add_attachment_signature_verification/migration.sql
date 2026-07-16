ALTER TABLE "attachments"
ADD COLUMN "signature_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "signature_report" JSONB,
ADD COLUMN "signature_verified_at" TIMESTAMP(3),
ADD COLUMN "signature_verifier" TEXT;
