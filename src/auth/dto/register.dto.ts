/**
 * register.dto.ts — Citizen registration DTO.
 */

import { IsEmail, IsString, MinLength, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Juan Carlos' })
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Guaman Suscal' })
  @IsString()
  last_name: string;

  @ApiProperty({ example: '0302145896', description: 'National ID card (10 digits)' })
  @IsString()
  @Length(10, 10, { message: 'National ID must be exactly 10 digits' })
  national_id: string;

  @ApiProperty({ example: 'citizen@correo.ec' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty({ example: '••••••••', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({ example: '0984758123' })
  @IsOptional()
  @IsString()
  phone?: string;
}
