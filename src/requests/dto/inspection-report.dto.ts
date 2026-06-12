import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class InspectionReportDto {
  @ApiPropertyOptional({ example: 'Technical inspection carried out successfully. Georeferenced measurements validated.' })
  @IsString()
  @IsOptional()
  comments?: string;
}
