import { IsEmail, IsString, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class CreateInstitutionalUserDto {
  @ApiProperty({ example: 'employee@gadcanar.gob.ec' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty({ example: 'Temporal2026!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Lopez' })
  @IsString()
  last_name: string;

  @ApiProperty({ example: '0102030405' })
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'National ID must be exactly 10 digits',
  })
  national_id: string;

  @ApiProperty({ example: '0987654321', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: Role, example: Role.TECHNICIAN })
  @IsEnum(Role, { message: 'Invalid role' })
  role: Role;
}
