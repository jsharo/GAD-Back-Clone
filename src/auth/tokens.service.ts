import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RefreshTokenStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const REFRESH_TOKEN_SALT_ROUNDS = 12;

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
};

type RefreshTokenPayload = {
  sub: string;
};

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async generateTokens(
    userId: string,
    email: string,
    role: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: AccessTokenPayload = { sub: userId, email, role };
    const refreshPayload: RefreshTokenPayload = { sub: userId };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: process.env.JWT_SECRET || 'jwt_secret_dev',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET || 'jwt_refresh_secret_dev',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    return { accessToken, refreshToken };
  }

  async saveRefreshToken(
    userId: string,
    refreshToken: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const hashedToken = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS);

    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashedToken,
        status: RefreshTokenStatus.ACTIVE,
        expiresAt,
      },
    });
  }

  async validateRefreshToken(userId: string, refreshToken: string) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        status: RefreshTokenStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });

    for (const storedToken of activeTokens) {
      const isValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
      if (isValid) {
        return storedToken;
      }
    }

    return null;
  }

  async revokeRefreshToken(refreshTokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: refreshTokenId },
      data: {
        status: RefreshTokenStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllUserTokens(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    await db.refreshToken.updateMany({
      where: { userId, status: RefreshTokenStatus.ACTIVE },
      data: {
        status: RefreshTokenStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }
}
