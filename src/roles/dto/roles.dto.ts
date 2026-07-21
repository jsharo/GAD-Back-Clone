import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ASSIGNABLE_ROLES } from '../../common/enums/role.enum';

export class CreateRoleDto {
  @ApiProperty({ example: 'TECHNICIAN' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePermissionDto {
  @ApiProperty({ example: 'requests.read' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'user_cuid_here' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    example: 'TECHNICIAN',
    enum: ASSIGNABLE_ROLES,
    description: 'Only confirmed institutional roles',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ASSIGNABLE_ROLES, {
    message: `roleName must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
  })
  roleName!: string;
}

export class SyncRolePermissionsDto {
  @ApiProperty({ example: ['users.read', 'users.write'], type: [String] })
  @IsString({ each: true })
  permissionIds!: string[];
}
