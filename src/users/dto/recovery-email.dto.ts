import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetRecoveryEmailDto {
  @ApiProperty({ example: 'backup@correo.ec' })
  @IsNotEmpty()
  @IsEmail()
  recoveryEmail!: string;
}

export class VerifyRecoveryEmailDto {
  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;
}
