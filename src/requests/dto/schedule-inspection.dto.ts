import { IsString, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduleInspectionDto {
  @ApiProperty({ example: '2026-06-20T10:00:00Z' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Ing. Carlos Altamirano' })
  @IsString()
  technician: string;

  @ApiPropertyOptional({ example: 'Technical visit planned for boundary verification' })
  @IsString()
  @IsOptional()
  comments?: string;
}
