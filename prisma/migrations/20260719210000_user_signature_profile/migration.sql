-- Capture electronic signature certificate profile on User (architect)
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "signature_cert_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_cert_common_name" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_cert_national_id" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_cert_issuer_cn" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_cert_valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_cert_valid_to" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_profile_captured_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_profile_source_attachment_id" TEXT;
