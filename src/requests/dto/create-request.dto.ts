import { IsEnum, IsString, IsNotEmpty, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RequestType } from '../../common/enums/request-type.enum';

class PropertyDto {
  @ApiProperty({ example: '03-01-00-000-000', required: false })
  @IsString()
  @IsOptional()
  cadastral_key?: string;

  @ApiProperty({ example: 'Canton Canar, Ecuador' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 120, required: false })
  @IsNumber()
  @IsOptional()
  area?: number;

  @ApiProperty({ example: 'URBAN' })
  @IsString()
  @IsNotEmpty()
  zone: string;
}

export class CreateRequestDto {
  @ApiProperty({ enum: RequestType, example: RequestType.CONSTRUCTION_PERMIT })
  @IsEnum(RequestType)
  request_type: RequestType;

  @ApiProperty({ example: '0900000000', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ type: PropertyDto })
  @ValidateNested()
  @Type(() => PropertyDto)
  property: PropertyDto;
}
