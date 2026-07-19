import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 15 * 1000;
const VERIFICATION_CODE_SALT_ROUNDS = 12;

@Injectable()
export class VerificationService {
  private readonly lastResendByEmail = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateNumericCode(length = 6): string {
    const max = 10 ** length;
    return String(Math.floor(Math.random() * max)).padStart(length, '0');
  }

  async createVerificationCode(userId: string): Promise<string> {
    const code = this.generateNumericCode();
    const hashedCode = await bcrypt.hash(code, VERIFICATION_CODE_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationCode: hashedCode,
        verificationExpiry: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    return code;
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const subject = 'Verifica tu correo — GAD Cañar';
    const text = `Tu código de verificación es: ${code}. Expira en 15 minutos.`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f;margin:0 0 16px">GAD Municipal de Cañar</h2>
        <p style="color:#334155;line-height:1.5">Usa este código para verificar tu correo electrónico:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;margin:24px 0">${code}</p>
        <p style="color:#64748b;font-size:14px">El código expira en 15 minutos. Si no solicitaste este registro, ignora este mensaje.</p>
      </div>
    `;

    await this.emailService.send({ to: email, subject, text, html });
  }

  async resendVerificationEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    const lastSent = this.lastResendByEmail.get(normalized) ?? 0;
    const remainingMs = RESEND_COOLDOWN_MS - (now - lastSent);

    if (remainingMs > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another code.`,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        status: true,
      },
    });

    // Same generic response whether user exists or not (no enumeration)
    if (!user || user.emailVerified || user.status !== 'ACTIVE') {
      this.lastResendByEmail.set(normalized, now);
      return {
        message: 'If the account needs verification, a new code was sent.',
      };
    }

    const code = await this.createVerificationCode(user.id);
    await this.sendVerificationEmail(user.email, code);
    this.lastResendByEmail.set(normalized, now);

    return {
      message: 'If the account needs verification, a new code was sent.',
    };
  }

  async validateCode(email: string, code: string): Promise<{ userId: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        verificationCode: true,
        verificationExpiry: true,
        emailVerified: true,
      },
    });

    if (!user?.verificationCode || !user.verificationExpiry) {
      throw new BadRequestException('No active verification code for this email.');
    }

    if (user.verificationExpiry.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired.');
    }

    const isValid = await bcrypt.compare(code, user.verificationCode);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code.');
    }

    return { userId: user.id };
  }

  async markEmailVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationExpiry: null,
      },
    });
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const { userId } = await this.validateCode(email, code);
    await this.markEmailVerified(userId);
  }
}
