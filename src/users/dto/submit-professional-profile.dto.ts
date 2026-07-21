import { IsNotEmpty, IsString, Length, Matches, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEcuadorianCedula } from '../../common/validators/is-ecuadorian-cedula.decorator';

/** Ej. 650211A01 = nivel(2) + campo(4) + carrera(letra+2) */
const SENESCYT_TITLE_CODE_REGEX = /^\d{6}[A-Za-z]\d{2}$/;

export class SubmitProfessionalProfileDto {
  @ApiProperty({ example: 'Juan Carlos' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'Guaman Suscal' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  lastname!: string;

  @ApiProperty({
    example: '0301000006',
    description: 'Valid Ecuadorian national ID (required for signature verification)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsNotEmpty()
  @IsString()
  @Length(10, 10)
  @IsEcuadorianCedula({
    message: 'The ID number is not valid. It must be a valid Ecuadorian national ID number.',
  })
  cedula!: string;

  @ApiProperty({
    example: '650211A01',
    description:
      'SENESCYT title code: level (2) + knowledge field (4) + career (letter + 2 digits)',
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @IsNotEmpty()
  @IsString()
  @MinLength(9)
  @MaxLength(9)
  @Matches(SENESCYT_TITLE_CODE_REGEX, {
    message:
      'senescytCode must match title code format (e.g. 650211A01: level + knowledge field + career)',
  })
  senescytCode!: string;
}
