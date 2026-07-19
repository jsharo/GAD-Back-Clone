import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_SALT_ROUNDS = 12;

@Injectable()
export class RecoveryEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateNumericCode(length = 6): string {
    const max = 10 ** length;
    return String(Math.floor(Math.random() * max)).padStart(length, '0');
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        lastname: true,
        recoveryEmail: true,
        recoveryEmailVerified: true,
        emailVerified: true,
        status: true,
        senescytCode: true,
        professionalStatus: true,
        cedula: true,
        signatureCertFingerprint: true,
        signatureCertCommonName: true,
        signatureCertNationalId: true,
        signatureCertIssuerCn: true,
        signatureCertValidFrom: true,
        signatureCertValidTo: true,
        signatureProfileCapturedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async setRecoveryEmail(userId: string, recoveryEmail: string) {
    const normalized = recoveryEmail.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (normalized === user.email.toLowerCase()) {
      throw new BadRequestException(
        'Recovery email must be different from your primary email.',
      );
    }

    const taken = await this.prisma.user.findFirst({
      where: {
        recoveryEmail: normalized,
        deletedAt: null,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (taken) {
      throw new ConflictException('This recovery email is already in use.');
    }

    const primaryConflict = await this.prisma.user.findFirst({
      where: {
        email: normalized,
        deletedAt: null,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (primaryConflict) {
      throw new ConflictException('This email cannot be used as recovery email.');
    }

    const code = this.generateNumericCode();
    const hashedCode = await bcrypt.hash(code, CODE_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        recoveryEmail: normalized,
        recoveryEmailVerified: false,
        recoveryEmailCode: hashedCode,
        recoveryEmailCodeExpiry: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await this.sendRecoveryVerificationEmail(normalized, code);

    return {
      message: 'Verification code sent to the recovery email.',
      recoveryEmail: normalized,
      recoveryEmailVerified: false,
    };
  }

  async verifyRecoveryEmail(userId: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        recoveryEmail: true,
        recoveryEmailCode: true,
        recoveryEmailCodeExpiry: true,
      },
    });

    if (!user?.recoveryEmail || !user.recoveryEmailCode || !user.recoveryEmailCodeExpiry) {
      throw new BadRequestException('No pending recovery email verification.');
    }

    if (user.recoveryEmailCodeExpiry.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired.');
    }

    const isValid = await bcrypt.compare(code, user.recoveryEmailCode);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        recoveryEmailVerified: true,
        recoveryEmailCode: null,
        recoveryEmailCodeExpiry: null,
      },
      select: {
        email: true,
        recoveryEmail: true,
        recoveryEmailVerified: true,
      },
    });

    return {
      message: 'Recovery email verified successfully.',
      ...updated,
    };
  }

  async removeRecoveryEmail(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        recoveryEmail: null,
        recoveryEmailVerified: false,
        recoveryEmailCode: null,
        recoveryEmailCodeExpiry: null,
      },
    });

    return { message: 'Recovery email removed.' };
  }

  private async sendRecoveryVerificationEmail(to: string, code: string) {
    const subject = 'Verifica tu email de recuperación — GAD Cañar';
    const text = `Tu código para confirmar el email de recuperación es: ${code}. Expira en 15 minutos.`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#004183;margin:0 0 16px">GAD Municipal de Cañar</h2>
        <p style="color:#334155;line-height:1.5">Usa este código para confirmar tu email de recuperación:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#004183;margin:24px 0">${code}</p>
        <p style="color:#64748b;font-size:14px">El código expira en 15 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `;
    await this.emailService.send({ to, subject, text, html });
  }
}
