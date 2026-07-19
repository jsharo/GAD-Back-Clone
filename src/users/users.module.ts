import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RegistrationService } from './registration.service';
import { RecoveryEmailService } from './recovery-email.service';
import { ProfessionalVerificationService } from './professional-verification.service';
import { AuditModule } from '../audit/audit.module';
import { RolesModule } from '../roles/roles.module';
import { VerificationModule } from '../verification/verification.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuditModule, RolesModule, VerificationModule, EmailModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    RegistrationService,
    RecoveryEmailService,
    ProfessionalVerificationService,
  ],
  exports: [UsersService, ProfessionalVerificationService],
})
export class UsersModule {}
