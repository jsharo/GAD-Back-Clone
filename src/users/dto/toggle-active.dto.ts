import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleActiveDto {
  @ApiProperty({ example: true, description: 'User activation status' })
  @IsBoolean()
  active: boolean;
}
