import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RolesService } from '../roles/roles.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { TokensService } from './tokens.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly tokensService: TokensService,
    private readonly auditService: AuditService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.validateCredentials(
      loginDto.email,
      loginDto.password,
    );

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const role = await this.rolesService.getUserRoleName(user.id);
    if (!role) {
      throw new UnauthorizedException('User has no assigned role');
    }

    const { accessToken, refreshToken } = await this.tokensService.generateTokens(
      user.id,
      user.email,
      role,
    );

    await this.tokensService.saveRefreshToken(user.id, refreshToken);

    await this.auditService.logAction(
      user.id,
      user.email,
      'LOGIN',
      `User ${user.email} logged in successfully`,
    );

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role },
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const storedToken = await this.tokensService.validateRefreshToken(
      userId,
      refreshToken,
    );

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const role = await this.rolesService.getUserRoleName(userId);
    if (!role) {
      throw new UnauthorizedException('User has no assigned role');
    }

    await this.tokensService.revokeRefreshToken(storedToken.id);

    const tokens = await this.tokensService.generateTokens(
      userId,
      user.email,
      role,
    );

    await this.tokensService.saveRefreshToken(userId, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string) {
    const user = await this.usersService.findById(userId);

    if (user) {
      await this.tokensService.revokeAllUserTokens(userId);
      await this.auditService.logAction(
        user.id,
        user.email,
        'LOGOUT',
        `User ${user.email} logged out successfully`,
      );
    }

    return { message: 'Session closed successfully' };
  }
}
