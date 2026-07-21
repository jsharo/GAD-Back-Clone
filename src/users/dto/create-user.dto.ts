import {

  IsEmail,

  IsString,

  IsNotEmpty,

  IsOptional,

  Length,

} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsStrongPassword,
  StrongPasswordApiProperty,
} from '../../common/validators/is-strong-password.decorator';



export class CreateUserDto {

  @ApiProperty({ example: 'citizen@correo.ec' })

  @IsNotEmpty()

  @IsEmail()

  email!: string;



  @StrongPasswordApiProperty(true)

  @IsNotEmpty()

  @IsString()

  @IsStrongPassword()

  password!: string;



  @ApiPropertyOptional({ example: '0302145896', description: 'Collected later in profile completion' })

  @IsOptional()

  @IsString()

  @Length(10, 10)

  cedula?: string;



  @ApiPropertyOptional({ example: 'Juan Carlos' })

  @IsOptional()

  @IsString()

  name?: string;



  @ApiPropertyOptional({ example: 'Guaman Suscal' })

  @IsOptional()

  @IsString()

  lastname?: string;



  @ApiPropertyOptional()

  @IsOptional()

  @IsString()

  direction?: string;

}
