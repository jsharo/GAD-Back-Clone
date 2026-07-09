import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SessionState } from '@prisma/client';
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
    meta?: { ip?: string; agent?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const hashedToken = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS);

    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expires_at = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.session.create({
      data: {
        user_id: userId,
        refresh_token: hashedToken,
        state: SessionState.ACTIVE,
        expires_at,
        ip: meta?.ip ?? null,
        agent: meta?.agent ?? null,
      },
    });
  }

  async validateRefreshToken(userId: string, refreshToken: string) {
    const activeTokens = await this.prisma.session.findMany({
      where: {
        user_id: userId,
        state: SessionState.ACTIVE,
        expires_at: { gt: new Date() },
      },
    });

    for (const storedToken of activeTokens) {
      const isValid = await bcrypt.compare(refreshToken, storedToken.refresh_token);
      if (isValid) {
        return storedToken;
      }
    }

    return null;
  }

  async revokeRefreshToken(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { session_id: sessionId },
      data: {
        state: SessionState.REVOKED,
        revoked_at: new Date(),
      },
    });
  }

  async revokeAllUserTokens(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    await db.session.updateMany({
      where: { user_id: userId, state: SessionState.ACTIVE },
      data: {
        state: SessionState.REVOKED,
        revoked_at: new Date(),
      },
    });
  }
}
