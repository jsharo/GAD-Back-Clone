import { IsEnum, IsString, IsNotEmpty, ValidateNested, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestType } from '../../common/enums/request-type.enum';

class PropertyDto {
  @ApiPropertyOptional({ example: '03-01-00-000-000' })
  @IsString()
  @IsOptional()
  cadastral_key?: string;

  @ApiProperty({ example: 'Canton Canar, Ecuador' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 120 })
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

  @ApiPropertyOptional({ example: '0900000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  /**
   * UUID of the citizen who owns the property.
   * Required when the request is created by an ARCHITECT.
   * If the citizen creates the request directly, this field is ignored
   * and their own `id` is used.
   */
  @ApiPropertyOptional({
    example: 'e3b0c442-98fc-1c14-9afb-f4c8996fb924',
    description:
      'UUID of the citizen on whose behalf the licensed professional registers the procedure. ' +
      'Required when the requester role is ARCHITECT.',
  })
  @IsUUID()
  @IsOptional()
  citizen_id?: string;

  @ApiProperty({ type: PropertyDto })
  @ValidateNested()
  @Type(() => PropertyDto)
  property: PropertyDto;
}
