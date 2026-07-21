import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import {
  AssignRoleDto,
  CreatePermissionDto,
  CreateRoleDto,
  SyncRolePermissionsDto,
  UpdatePermissionDto,
  UpdateRoleDto,
} from './dto/roles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List all permissions' })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Post('permissions')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Create permission' })
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.rolesService.createPermission(dto.name, dto.description);
  }

  @Patch('permissions/:id')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Update permission' })
  updatePermission(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.rolesService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Delete permission' })
  deletePermission(@Param('id') id: string) {
    return this.rolesService.deletePermission(id);
  }

  @Post('assign')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(@Body() dto: AssignRoleDto, @CurrentUser() actor: { id: string }) {
    return this.rolesService.assignRole(dto.userId, dto.roleName, actor.id);
  }

  @Get('users/:userId/permissions/breakdown')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get role vs direct permission breakdown for a user' })
  getUserPermissionBreakdown(@Param('userId') userId: string) {
    return this.rolesService.getUserPermissionBreakdown(userId);
  }

  @Get('users/:userId/permissions/direct')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get permissions directly assigned to a user' })
  getUserDirectPermissions(@Param('userId') userId: string) {
    return this.rolesService.getUserDirectPermissionIds(userId);
  }

  @Put('users/:userId/permissions')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Replace permissions directly assigned to a user' })
  syncUserPermissions(@Param('userId') userId: string, @Body() dto: SyncRolePermissionsDto) {
    return this.rolesService.syncUserPermissions(userId, dto.permissionIds);
  }

  @Get('users/:userId/permissions')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get effective permissions for a user' })
  getEffectivePermissions(@Param('userId') userId: string) {
    return this.rolesService.getEffectivePermissions(userId);
  }

  @Get()
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List all roles' })
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Post()
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Create role' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto.name, dto.description);
  }

  @Get(':id')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get role by id with permissions' })
  findRoleById(@Param('id') id: string) {
    return this.rolesService.findRoleById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Update role' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Put(':id/permissions')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Replace permissions assigned to a role' })
  syncRolePermissions(@Param('id') id: string, @Body() dto: SyncRolePermissionsDto) {
    return this.rolesService.syncRolePermissions(id, dto.permissionIds);
  }

  @Delete(':id')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Delete role' })
  deleteRole(@Param('id') id: string) {
    return this.rolesService.deleteRole(id);
  }
}
