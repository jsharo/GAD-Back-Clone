import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '../../common/enums/request-status.enum';

export class UpdateStatusDto {
  @ApiProperty({ enum: RequestStatus, example: RequestStatus.PENDING_TECHNICIAN })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({ example: 'Correction required in plans' })
  @IsString()
  @IsOptional()
  comment?: string;
}
