import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { CreateInstitutionalUserDto } from './dto/create-institutional-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users_service: UsersService) {}

  @Post('institutional')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Create an institutional user (SUPERADMIN only)' })
  async createInstitutional(
    @Body() create_institutional_dto: CreateInstitutionalUserDto,
    @CurrentUser() admin_user: any,
  ) {
    const data = await this.users_service.createInstitutional(create_institutional_dto, admin_user);
    return { success: true, data };
  }

  @Get()
  @Roles(Role.SUPERADMIN, Role.SECRETARY)
  @ApiOperation({ summary: 'List all system users' })
  async findAll() {
    const data = await this.users_service.findAll();
    return { success: true, data };
  }

  @Get('technicians')
  @Roles(Role.SECRETARY, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get active technicians' })
  async findTechnicians() {
    const data = await this.users_service.findTechnicians();
    return { success: true, data };
  }

  @Get('dashboard/stats')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Global dashboard stats' })
  async getDashboardStats() {
    const data = await this.users_service.getDashboardStats();
    return { success: true, ...data };
  }

  @Patch(':id/zone')
  @Roles(Role.SUPERADMIN, Role.SECRETARY)
  @ApiOperation({ summary: 'Assign or update technician zone' })
  async updateZone(
    @Param('id') id: string,
    @Body() update_zone_dto: UpdateZoneDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.users_service.updateZone(id, update_zone_dto, user);
    return { success: true, data };
  }

  @Patch(':id/toggle-active')
  @Roles(Role.SUPERADMIN, Role.SECRETARY)
  @ApiOperation({ summary: 'Enable or disable user access' })
  async toggleActive(
    @Param('id') id: string,
    @Body() toggle_active_dto: ToggleActiveDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.users_service.toggleActive(id, toggle_active_dto, user);
    return { success: true, data };
  }
}
