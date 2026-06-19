import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokensService } from './tokens.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    PassportModule,
    AuditModule,
    RolesModule,
    forwardRef(() => UsersModule),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
