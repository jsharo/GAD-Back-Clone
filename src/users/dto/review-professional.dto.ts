import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewProfessionalDto {
  @ApiProperty({
    example: true,
    description: 'true = approve (VERIFIED), false = reject (REJECTED)',
  })
  @IsNotEmpty()
  @IsBoolean()
  approved!: boolean;
}
