export type SignatureIdentityStatus = 'MATCH' | 'MISMATCH' | 'INDETERMINATE';

export type SignatureTrustStatus =
  | 'TRUSTED'
  | 'UNTRUSTED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export type SignatureVerificationStatus =
  | 'MATCH'
  | 'MATCH_WITH_WARNINGS'
  | 'MISMATCH'
  | 'UNSIGNED'
  | 'INVALID'
  | 'INDETERMINATE'
  | 'ERROR';

export interface ExpectedSigner {
  id: string | null;
  role: 'PROFESSIONAL' | 'CITIZEN' | 'UNKNOWN';
  full_name: string;
  national_id: string | null;
}

export interface NationalIdCandidate {
  value: string;
  source: string;
}

export interface RawPdfSignature {
  index: number;
  field_name: string | null;
  common_name: string | null;
  given_name: string | null;
  surname: string | null;
  organization: string | null;
  country: string | null;
  national_id_candidates: NationalIdCandidate[];
  issuer_common_name: string | null;
  certificate_fingerprint_sha256: string;
  certificate_valid_from: string | null;
  certificate_valid_to: string | null;
  expired: boolean;
  not_yet_valid: boolean;
  signing_time: string | null;
  digest_algorithm: string | null;
  subfilter: string | null;
  reason: string | null;
  location: string | null;
  integrity_valid: boolean;
  intact: boolean;
  cryptographic_signature_valid: boolean;
  trusted: boolean;
  revoked: boolean;
  coverage: string | null;
  modification_level: string | null;
  docmdp_ok: boolean | null;
  timestamp_valid: boolean | null;
  validation_error: string | null;
}

export interface SignatureEngineReport {
  schema_version: number;
  engine?: { name: string; version: string };
  status: 'UNSIGNED' | 'SIGNED_INTACT' | 'SIGNED_INVALID' | 'ERROR';
  error_code?: string;
  trust_configured?: boolean;
  network_validation_enabled?: boolean;
  signature_count: number;
  signatures: RawPdfSignature[];
}

export interface VerifiedPdfSignature extends RawPdfSignature {
  national_id: string | null;
  national_id_source: string | null;
  identity_status: SignatureIdentityStatus;
  identity_message: string;
  trust_status: SignatureTrustStatus;
  name_matches_expected: boolean;
}

export interface DocumentSignatureReport {
  schema_version: number;
  document_hash: string;
  verified_at: string;
  verifier: string;
  status: SignatureVerificationStatus;
  engine_status: string;
  engine_error_code: string | null;
  trust_configured: boolean;
  network_validation_enabled: boolean;
  signature_count: number;
  has_valid_expected_signature: boolean;
  expected_signer: ExpectedSigner;
  signatures: VerifiedPdfSignature[];
  warnings: string[];
}

export interface AttachmentSignatureReport extends DocumentSignatureReport {
  attachment_id: string;
  attachment_name: string;
  stored_hash: string | null;
  storage_integrity_valid: boolean;
}

export interface RequestSignatureSummary {
  status: SignatureVerificationStatus;
  has_valid_expected_signature: boolean;
  requires_acknowledgement: boolean;
  expected_signer: ExpectedSigner;
  pdf_count: number;
  signature_count: number;
  verified_at: string;
  attachments: AttachmentSignatureReport[];
  warnings: string[];
}
