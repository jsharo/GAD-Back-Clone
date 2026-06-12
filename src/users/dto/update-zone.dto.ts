import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PropertyZoneDto {
  URBAN = 'URBAN',
  RURAL = 'RURAL'
}

export class UpdateZoneDto {
  @ApiProperty({ enum: PropertyZoneDto, example: PropertyZoneDto.URBAN })
  @IsEnum(PropertyZoneDto)
  zone: PropertyZoneDto;
}
