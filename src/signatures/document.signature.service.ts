import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  AttachmentSignatureReport,
  DocumentSignatureReport,
  ExpectedSigner,
  RawPdfSignature,
  RequestSignatureSummary,
  SignatureEngineReport,
  SignatureIdentityStatus,
  SignatureTrustStatus,
  SignatureVerificationStatus,
  VerifiedPdfSignature,
} from './signature.verification.types';

@Injectable()
export class DocumentSignatureService {
  private normalizeNationalId(value: string | null | undefined) {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length === 10 ? digits : null;
  }

  private normalizeName(value: string | null | undefined) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  }

  private getCertificateName(signature: RawPdfSignature) {
    return (
      signature.common_name ||
      [signature.given_name, signature.surname].filter(Boolean).join(' ') ||
      ''
    );
  }

  private compareIdentity(
    signature: RawPdfSignature,
    expected_signer: ExpectedSigner,
  ): {
    identity_status: SignatureIdentityStatus;
    identity_message: string;
    national_id: string | null;
    national_id_source: string | null;
    name_matches_expected: boolean;
  } {
    const expected_id = this.normalizeNationalId(expected_signer.national_id);
    const candidates = (signature.national_id_candidates || [])
      .map((candidate) => ({
        value: this.normalizeNationalId(candidate.value),
        source: candidate.source,
      }))
      .filter((candidate) => candidate.value);
    const certificate_name = this.normalizeName(this.getCertificateName(signature));
    const expected_name = this.normalizeName(expected_signer.full_name);
    const name_matches_expected = Boolean(
      certificate_name && expected_name && certificate_name === expected_name,
    );

    if (expected_id && candidates.length) {
      const match = candidates.find((candidate) => candidate.value === expected_id);
      if (match) {
        return {
          identity_status: 'MATCH',
          identity_message: 'The certificate national ID matches the expected person.',
          national_id: match.value,
          national_id_source: match.source,
          name_matches_expected,
        };
      }

      return {
        identity_status: 'MISMATCH',
        identity_message: 'The certificate national ID does not match the expected person.',
        national_id: candidates[0].value,
        national_id_source: candidates[0].source,
        name_matches_expected,
      };
    }

    if (name_matches_expected) {
      return {
        identity_status: 'INDETERMINATE',
        identity_message: 'The name matches, but the certificate does not expose a verifiable national ID.',
        national_id: candidates[0]?.value || null,
        national_id_source: candidates[0]?.source || null,
        name_matches_expected,
      };
    }

    return {
      identity_status: 'INDETERMINATE',
      identity_message: 'The certificate does not contain sufficient identity for a conclusive comparison.',
      national_id: candidates[0]?.value || null,
      national_id_source: candidates[0]?.source || null,
      name_matches_expected,
    };
  }

  private getTrustStatus(
    signature: RawPdfSignature,
    trust_configured: boolean,
  ): SignatureTrustStatus {
    if (signature.revoked) return 'REVOKED';
    if (signature.expired || signature.not_yet_valid) return 'EXPIRED';
    if (signature.trusted) return 'TRUSTED';
    if (!trust_configured) return 'NOT_CONFIGURED';
    return 'UNTRUSTED';
  }

  private pythonCandidates() {
    const configured = process.env.SIGNATURE_PYTHON_EXECUTABLE?.trim();
    const local_venv =
      process.platform === 'win32'
        ? path.resolve(process.cwd(), '.venv-signatures', 'Scripts', 'python.exe')
        : path.resolve(process.cwd(), '.venv-signatures', 'bin', 'python');
    const candidates = [configured, fs.existsSync(local_venv) ? local_venv : null];
    candidates.push(process.platform === 'win32' ? 'python' : 'python3', 'python');
    return [...new Set(candidates.filter(Boolean) as string[])];
  }

  private runEngine(file_path: string): Promise<SignatureEngineReport> {
    const script_path = path.resolve(
      process.cwd(),
      'signature-verifier',
      'verify.pdf.py',
    );
    if (!fs.existsSync(script_path)) {
      return Promise.resolve({
        schema_version: 1,
        status: 'ERROR',
        error_code: 'VERIFIER_SCRIPT_NOT_FOUND',
        signature_count: 0,
        signatures: [],
      });
    }

    const timeout = Number(process.env.SIGNATURE_VERIFIER_TIMEOUT_MS || 20000);
    const candidates = this.pythonCandidates();

    return new Promise((resolve) => {
      const tryCandidate = (index: number) => {
        if (index >= candidates.length) {
          resolve({
            schema_version: 1,
            status: 'ERROR',
            error_code: 'PYTHON_NOT_FOUND',
            signature_count: 0,
            signatures: [],
          });
          return;
        }

        execFile(
          candidates[index],
          [script_path, file_path],
          {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024,
            timeout: Number.isFinite(timeout) ? timeout : 20000,
            windowsHide: true,
          },
          (error, stdout) => {
            if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
              tryCandidate(index + 1);
              return;
            }

            try {
              const parsed = JSON.parse(stdout.trim()) as SignatureEngineReport;
              if (!Array.isArray(parsed.signatures) || typeof parsed.signature_count !== 'number') {
                throw new Error('Invalid verifier response');
              }
              resolve(parsed);
            } catch {
              resolve({
                schema_version: 1,
                status: 'ERROR',
                error_code: error?.killed ? 'VERIFIER_TIMEOUT' : 'INVALID_ENGINE_RESPONSE',
                signature_count: 0,
                signatures: [],
              });
            }
          },
        );
      };

      tryCandidate(0);
    });
  }

  private buildStatus(
    signatures: VerifiedPdfSignature[],
    engine_report: SignatureEngineReport,
  ): SignatureVerificationStatus {
    if (engine_report.status === 'ERROR') return 'ERROR';
    if (!signatures.length) return 'UNSIGNED';

    const valid_matches = signatures.filter(
      (signature) => signature.integrity_valid && signature.identity_status === 'MATCH',
    );
    const explicit_mismatches = signatures.filter(
      (signature) => signature.integrity_valid && signature.identity_status === 'MISMATCH',
    );
    const invalid_signatures = signatures.filter((signature) => !signature.integrity_valid);

    if (valid_matches.length) {
      const has_warnings =
        explicit_mismatches.length > 0 ||
        invalid_signatures.length > 0 ||
        signatures.some((signature) => signature.trust_status !== 'TRUSTED');
      return has_warnings ? 'MATCH_WITH_WARNINGS' : 'MATCH';
    }
    if (invalid_signatures.length === signatures.length) return 'INVALID';
    if (explicit_mismatches.length) return 'MISMATCH';
    return 'INDETERMINATE';
  }

  private buildWarnings(
    signatures: VerifiedPdfSignature[],
    status: SignatureVerificationStatus,
  ) {
    const warnings: string[] = [];
    if (status === 'UNSIGNED') warnings.push('The PDF does not contain embedded digital signatures.');
    if (status === 'MISMATCH') {
      warnings.push('No intact signature matches the expected person\'s national ID.');
    }
    if (status === 'INVALID') {
      warnings.push('The signatures found did not pass the integrity check.');
    }
    if (status === 'INDETERMINATE') {
      warnings.push('The signatures could not be conclusively associated with an identity.');
    }
    if (status === 'ERROR') warnings.push('The signature engine could not analyze the PDF.');
    if (signatures.some((signature) => signature.identity_status === 'MISMATCH')) {
      warnings.push('The document contains at least one signature from a different person.');
    }
    if (signatures.some((signature) => !signature.integrity_valid)) {
      warnings.push('The document contains at least one invalid signature or one affected by changes.');
    }
    if (signatures.some((signature) => signature.trust_status === 'NOT_CONFIGURED')) {
      warnings.push('The trust chain is not configured; this alone does not invalidate integrity.');
    }
    if (signatures.some((signature) => signature.trust_status === 'UNTRUSTED')) {
      warnings.push('The certificate chain does not reach a configured trust root.');
    }
    if (signatures.some((signature) => signature.trust_status === 'REVOKED')) {
      warnings.push('A revoked certificate was detected.');
    }
    if (signatures.some((signature) => signature.trust_status === 'EXPIRED')) {
      warnings.push('A certificate outside its validity period was detected.');
    }
    return [...new Set(warnings)];
  }

  async verifyPdf(
    file_path: string,
    document_hash: string,
    expected_signer: ExpectedSigner,
  ): Promise<DocumentSignatureReport> {
    const engine_report = await this.runEngine(file_path);
    const trust_configured = Boolean(engine_report.trust_configured);
    const signatures = (engine_report.signatures || []).map((signature) => {
      const identity = this.compareIdentity(signature, expected_signer);
      return {
        ...signature,
        ...identity,
        trust_status: this.getTrustStatus(signature, trust_configured),
      } satisfies VerifiedPdfSignature;
    });
    const status = this.buildStatus(signatures, engine_report);

    return {
      schema_version: 1,
      document_hash,
      verified_at: new Date().toISOString(),
      verifier: engine_report.engine
        ? `${engine_report.engine.name}@${engine_report.engine.version}`
        : 'pyhanko',
      status,
      engine_status: engine_report.status,
      engine_error_code: engine_report.error_code || null,
      trust_configured,
      network_validation_enabled: Boolean(engine_report.network_validation_enabled),
      signature_count: signatures.length,
      has_valid_expected_signature: signatures.some(
        (signature) => signature.integrity_valid && signature.identity_status === 'MATCH',
      ),
      expected_signer,
      signatures,
      warnings: this.buildWarnings(signatures, status),
    };
  }

  buildRequestSummary(
    reports: AttachmentSignatureReport[],
    expected_signer: ExpectedSigner,
  ): RequestSignatureSummary {
    const has_valid_expected_signature = reports.some(
      (report) => report.has_valid_expected_signature && report.storage_integrity_valid,
    );
    let status: SignatureVerificationStatus;

    if (!reports.length) status = 'UNSIGNED';
    else if (has_valid_expected_signature) {
      status = reports.every(
        (report) => report.status === 'MATCH' && report.storage_integrity_valid,
      )
        ? 'MATCH'
        : 'MATCH_WITH_WARNINGS';
    } else if (reports.some((report) => report.status === 'MISMATCH')) status = 'MISMATCH';
    else if (reports.some((report) => report.status === 'INVALID')) status = 'INVALID';
    else if (reports.every((report) => report.status === 'UNSIGNED')) status = 'UNSIGNED';
    else if (reports.some((report) => report.status === 'ERROR')) status = 'ERROR';
    else status = 'INDETERMINATE';

    return {
      status,
      has_valid_expected_signature,
      requires_acknowledgement: status !== 'MATCH',
      expected_signer,
      pdf_count: reports.length,
      signature_count: reports.reduce((total, report) => total + report.signature_count, 0),
      verified_at: new Date().toISOString(),
      attachments: reports,
      warnings: [
        ...new Set(
          reports.flatMap((report) =>
            report.warnings.map(
              (warning) => `${report.attachment_name}: ${warning}`,
            ),
          ),
        ),
      ],
    };
  }
}
