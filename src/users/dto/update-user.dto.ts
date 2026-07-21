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
    message: 'The ID number is not valid. It must be a valid Ecuadorian national ID number.',
  })
  cedula?: string;

  @StrongPasswordApiProperty(false)
  @IsOptional()
  @IsString()
  @IsStrongPassword()
  password?: string;
}
