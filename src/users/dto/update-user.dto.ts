import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEcuadorianCedula } from '../../common/validators/is-ecuadorian-cedula.decorator';
import {
  IsStrongPassword,
  StrongPasswordApiProperty,
} from '../../common/validators/is-strong-password.decorator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direction?: string;

  @ApiPropertyOptional({ example: '0301000006' })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  @IsEcuadorianCedula({
    message: 'La cédula no es válida. Debe ser un número de identidad ecuatoriano real.',
  })
  cedula?: string;

  @StrongPasswordApiProperty(false)
  @IsOptional()
  @IsString()
  @IsStrongPassword()
  password?: string;
}
