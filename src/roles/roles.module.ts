import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [RolesController],
  providers: [RolesService, RolesGuard],
  exports: [RolesService, RolesGuard],
})
export class RolesModule {}
