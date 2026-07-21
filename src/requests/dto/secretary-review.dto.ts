import { IsBoolean, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SecretaryReviewDto — Request body for the secretary's decision on a procedure.
 *
 * Flow (automatic verification and non-blocking exception):
 *  - The backend derives signature_validated from the signature report.
 *  - Without a match, approval requires acknowledge_signature_warning=true.
 *  - approved=false moves the request file to OBSERVED.
 *  - approved=true moves the request file to PENDING_TECHNICIAN.
 */
export class SecretaryReviewDto {
  @ApiPropertyOptional({
    example: false,
    deprecated: true,
    description:
      'Backward compatibility for older clients. The backend calculates this value automatically ' +
      'from signature integrity and identity matching.',
  })
  @IsBoolean()
  @IsOptional()
  signature_validated?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Explicit confirmation to proceed when no intact signature matches ' +
      'the expected person. Does not change the automatic result.',
  })
  @IsBoolean()
  @IsOptional()
  acknowledge_signature_warning?: boolean;

  /**
   * Final secretary decision:
   * - true  → approve and forward to technical review (PENDING_TECHNICIAN)
   * - false → observe the request file (OBSERVED), which returns to the responsible party for corrections
   */
  @ApiProperty({
    example: true,
    description: 'true: approve and forward to technician | false: observe and return for corrections.',
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    example: 'Documentation complete. Identity verified. Forwarded for technical inspection.',
    description: 'Remarks or reason for rejection.',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
