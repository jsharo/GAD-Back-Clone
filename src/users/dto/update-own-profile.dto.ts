import { IsNotEmpty, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEcuadorianCedula } from '../../common/validators/is-ecuadorian-cedula.decorator';

export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ example: 'Juan Carlos' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Guaman Suscal' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastname?: string;

  @ApiPropertyOptional({
    example: '0301000006',
    description: 'Valid Ecuadorian national ID (modulo 10 algorithm)',
  })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  @IsEcuadorianCedula({
    message: 'The ID number is not valid. It must be a valid Ecuadorian national ID number.',
  })
  cedula?: string;
}
