import {

  IsEmail,

  IsString,

  IsNotEmpty,

  MinLength,

  IsOptional,

  Length,

} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export class CreateUserDto {

  @ApiProperty({ example: 'citizen@correo.ec' })

  @IsNotEmpty()

  @IsEmail()

  email!: string;



  @ApiProperty({ minLength: 8 })

  @IsNotEmpty()

  @IsString()

  @MinLength(8)

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

