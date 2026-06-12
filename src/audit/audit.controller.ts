import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit_service: AuditService) {}

  @Get()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'List all audit logs' })
  async findAll() {
    const data = await this.audit_service.findAll();
    return { success: true, data };
  }

  @Get('verify')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Verify integrity and immutability of the log chain' })
  async verify() {
    const data = await this.audit_service.verifyIntegrity();
    return { success: true, ...data };
  }
}
