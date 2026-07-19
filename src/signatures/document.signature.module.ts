import { Module } from '@nestjs/common';
import { DocumentSignatureService } from './document.signature.service';
import { SignatureProfileService } from './signature.profile.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [DocumentSignatureService, SignatureProfileService],
  exports: [DocumentSignatureService, SignatureProfileService],
})
export class DocumentSignatureModule {}
