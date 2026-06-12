/**
 * app.module.ts — Root module of the application.
 * Imports all functional modules of the system.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RequestModule } from './requests/request.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RequestModule,
    UsersModule,
    AuditModule,
  ],
})
export class AppModule {}
