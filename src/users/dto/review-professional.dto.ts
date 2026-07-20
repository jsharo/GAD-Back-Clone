import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewProfessionalDto {
  @ApiProperty({
    example: true,
    description: 'true = habilitar (VERIFIED), false = rechazar (REJECTED)',
  })
  @IsNotEmpty()
  @IsBoolean()
  approved!: boolean;
}
