import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveRequestDto {
  @ApiPropertyOptional({ example: true, description: 'True to approve, false to deny (if there is no payment)' })
  @IsBoolean()
  @IsOptional()
  approved?: boolean;

  @ApiPropertyOptional({ example: 120.50, description: 'Amount to pay if the resolution involves payment' })
  @IsNumber()
  @IsOptional()
  payment_amount?: number;

  @ApiProperty({ example: 'Favorable technical resolution. Payment proceeds.' })
  @IsString()
  comments: string;
}
