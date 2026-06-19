import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const CODE_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_CODE_SALT_ROUNDS = 12;

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

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
