import { Module } from '@nestjs/common';
import { DocumentSignatureService } from './document.signature.service';

@Module({
  providers: [DocumentSignatureService],
  exports: [DocumentSignatureService],
})
export class DocumentSignatureModule {}
