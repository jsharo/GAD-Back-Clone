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
    description: 'Cédula ecuatoriana válida (algoritmo módulo 10)',
  })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  @IsEcuadorianCedula({
    message: 'cedula must be a valid Ecuadorian national ID number',
  })
  cedula?: string;
}
