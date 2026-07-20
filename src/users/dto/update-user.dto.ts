import { IsOptional, IsString, Length, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEcuadorianCedula } from '../../common/validators/is-ecuadorian-cedula.decorator';

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
    message: 'cedula must be a valid Ecuadorian national ID number',
  })
  cedula?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
