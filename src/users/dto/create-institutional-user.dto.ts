import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { ASSIGNABLE_ROLES } from '../../common/enums/role.enum';

export class CreateInstitutionalUserDto extends CreateUserDto {
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
