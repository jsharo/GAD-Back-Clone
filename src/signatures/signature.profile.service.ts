import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DocumentSignatureReport,
  ExpectedSigner,
  VerifiedPdfSignature,
} from './signature.verification.types';

export type CapturedSignatureProfile = {
  fingerprint: string;
  commonName: string | null;
  nationalId: string | null;
  issuerCn: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  attachmentId: string | null;
};

@Injectable()
export class SignatureProfileService {
  private readonly logger = new Logger(SignatureProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Si el firmante esperado es un profesional y hay al menos una firma
   * íntegra con identidad MATCH, guarda el certificado en el User.
   */
  async captureFromVerifiedReport(
    expected_signer: ExpectedSigner,
    report: DocumentSignatureReport,
    attachmentId?: string | null,
  ): Promise<CapturedSignatureProfile | null> {
    if (expected_signer.role !== 'PROFESSIONAL' || !expected_signer.id) {
      return null;
    }

    if (!report.has_valid_expected_signature) {
      return null;
    }

    const matched = this.pickMatchedSignature(report.signatures);
    if (!matched?.certificate_fingerprint_sha256) {
      return null;
    }

    const commonName =
      matched.common_name ||
      [matched.given_name, matched.surname].filter(Boolean).join(' ') ||
      null;

    const profile: CapturedSignatureProfile = {
      fingerprint: matched.certificate_fingerprint_sha256,
      commonName,
      nationalId: matched.national_id,
      issuerCn: matched.issuer_common_name,
      validFrom: this.parseDate(matched.certificate_valid_from),
      validTo: this.parseDate(matched.certificate_valid_to),
      attachmentId: attachmentId ?? null,
    };

    const user = await this.prisma.user.findFirst({
      where: { id: expected_signer.id, deletedAt: null },
      select: {
        id: true,
        email: true,
        signatureCertFingerprint: true,
      },
    });

    if (!user) return null;

    const rotated =
      Boolean(user.signatureCertFingerprint) &&
      user.signatureCertFingerprint !== profile.fingerprint;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        signatureCertFingerprint: profile.fingerprint,
        signatureCertCommonName: profile.commonName,
        signatureCertNationalId: profile.nationalId,
        signatureCertIssuerCn: profile.issuerCn,
        signatureCertValidFrom: profile.validFrom,
        signatureCertValidTo: profile.validTo,
        signatureProfileCapturedAt: new Date(),
        signatureProfileSourceAttachmentId: profile.attachmentId,
      },
    });

    await this.auditService.logAction(
      user.id,
      user.email,
      rotated ? 'UPDATE_SIGNATURE_PROFILE' : 'CAPTURE_SIGNATURE_PROFILE',
      `Signature certificate profile ${rotated ? 'updated' : 'captured'} ` +
        `fingerprint=${profile.fingerprint.slice(0, 16)}... ` +
        `cn=${profile.commonName ?? 'n/a'} ` +
        `cedula=${profile.nationalId ?? 'n/a'}`,
    );

    this.logger.log(
      `Signature profile ${rotated ? 'updated' : 'saved'} for user ${user.email}`,
    );

    return profile;
  }

  private pickMatchedSignature(
    signatures: VerifiedPdfSignature[],
  ): VerifiedPdfSignature | null {
    return (
      signatures.find(
        (signature) =>
          signature.integrity_valid && signature.identity_status === 'MATCH',
      ) ?? null
    );
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
