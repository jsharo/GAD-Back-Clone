/**
 * app.module.ts — Root module of the application.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { VerificationModule } from './verification/verification.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { RequestModule } from './requests/request.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    VerificationModule,
    RolesModule,
    UsersModule,
    AuthModule,
    PasswordResetModule,
    RequestModule,
    AuditModule,
  ],
})
export class AppModule {}
