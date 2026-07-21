import { Module, forwardRef } from '@nestjs/common';
import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { FeeRulesService } from './fee-rules.service';
import { AuditModule } from '../audit/audit.module';
import { IpfsModule } from '../ipfs/ipfs.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { DocumentSignatureModule } from '../signatures/document.signature.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    AuditModule,
    IpfsModule,
    BlockchainModule,
    DocumentSignatureModule,
    RolesModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [RequestController],
  providers: [RequestService, FeeRulesService],
  exports: [RequestService],
})
export class RequestModule {}
