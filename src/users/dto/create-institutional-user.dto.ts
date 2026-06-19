import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class CreateInstitutionalUserDto extends CreateUserDto {
  @ApiProperty({ example: 'TECHNICIAN' })
  @IsString()
  @IsNotEmpty()
  roleName!: string;
}
