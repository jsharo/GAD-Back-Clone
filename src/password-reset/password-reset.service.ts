import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { TokensService } from '../auth/tokens.service';

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_SALT_ROUNDS = 12;
const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly tokensService: TokensService,
  ) {}

  /**
   * Accepts primary email OR verified recovery email.
   * Sends the reset code to the same address the user typed.
   */
  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.findUserByAccountEmail(normalized);

    if (!user || user.status !== 'ACTIVE') {
      throw new NotFoundException(
        'We could not find an account with that email. Use your primary email or your verified recovery email.',
      );
    }

    const code = this.generateNumericCode();
    const hashedCode = await bcrypt.hash(code, CODE_SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCode: hashedCode,
        passwordResetExpiry: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await this.sendResetEmail(normalized, code, this.maskEmail(normalized));

    return {
      message: `We sent a verification code to ${this.maskEmail(normalized)}.`,
    };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.findUserByAccountEmail(normalized);

    if (!user?.passwordResetCode || !user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired code.');
    }

    if (user.passwordResetExpiry.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired code.');
    }

    const isValid = await bcrypt.compare(code, user.passwordResetCode);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired code.');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          passwordResetCode: null,
          passwordResetExpiry: null,
        },
      });
      await this.tokensService.revokeAllUserTokens(user.id, tx);
    });

    return { message: 'Password updated. You can now sign in.' };
  }

  private async findUserByAccountEmail(normalized: string) {
    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: normalized },
          {
            recoveryEmail: normalized,
            recoveryEmailVerified: true,
          },
        ],
      },
      select: {
        id: true,
        email: true,
        status: true,
        recoveryEmail: true,
        recoveryEmailVerified: true,
        passwordResetCode: true,
        passwordResetExpiry: true,
      },
    });
  }

  private generateNumericCode(length = 6): string {
    const max = 10 ** length;
    return String(Math.floor(Math.random() * max)).padStart(length, '0');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
  }

  private async sendResetEmail(to: string, code: string, masked: string) {
    const subject = 'Reset password — GAD Cañar';
    const text = `Your password reset code is: ${code}. It expires in 15 minutes. Sent to ${masked}.`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#004183;margin:0 0 16px">GAD Municipal de Cañar</h2>
        <p style="color:#334155;line-height:1.5">We received a request to reset your password. Use this code:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#004183;margin:24px 0">${code}</p>
        <p style="color:#64748b;font-size:14px">Sent to: ${masked}. The code expires in 15 minutes. If you did not request this change, ignore this message.</p>
      </div>
    `;
    await this.emailService.send({ to, subject, text, html });
  }
}
