/**
 * register-architect.dto.ts — DTO for external Architect registration.
 * The degree_file field is handled by Multer (multipart/form-data) in the controller.
 */

import { IsEmail, IsString, MinLength, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterArchitectDto {
  @ApiProperty({ example: 'Carlos' })
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Vera Illescas' })
  @IsString()
  last_name: string;

  @ApiProperty({ example: '0303214578' })
  @IsString()
  @Length(10, 10, { message: 'National ID must be exactly 10 digits' })
  national_id: string;

  @ApiProperty({ example: 'architect@correo.ec' })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({ example: '0984758123' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Architect', description: 'Professional degree recognized by SENESCYT' })
  @IsString()
  degree: string;

  @ApiProperty({ example: 'SENESCYT-20-001234' })
  @IsString()
  registration_number: string;
}
