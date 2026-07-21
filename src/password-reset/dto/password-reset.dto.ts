import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsStrongPassword,
  StrongPasswordApiProperty,
} from '../../common/validators/is-strong-password.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ciudadano@correo.ec' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'ciudadano@correo.ec' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;

  @StrongPasswordApiProperty(true)
  @IsNotEmpty()
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
