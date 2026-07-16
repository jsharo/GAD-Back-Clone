import { IsBoolean, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SecretaryReviewDto — Cuerpo de la decisión de la secretaría sobre un trámite.
 *
 * Flujo (verificación automática y excepción no bloqueante):
 *  - El backend deriva signature_validated del informe de firmas.
 *  - Sin coincidencia, aprobar exige acknowledge_signature_warning=true.
 *  - approved=false lleva el expediente a OBSERVED.
 *  - approved=true lleva el expediente a PENDING_TECHNICIAN.
 */
export class SecretaryReviewDto {
  @ApiPropertyOptional({
    example: false,
    deprecated: true,
    description:
      'Compatibilidad con clientes anteriores. El backend calcula este valor automáticamente ' +
      'a partir de la integridad de la firma y la coincidencia de identidad.',
  })
  @IsBoolean()
  @IsOptional()
  signature_validated?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Confirmación explícita para continuar cuando no existe una firma íntegra que coincida ' +
      'con la persona esperada. No cambia el resultado automático.',
  })
  @IsBoolean()
  @IsOptional()
  acknowledge_signature_warning?: boolean;

  /**
   * Decisión final de la secretaría:
   * - true  → aprueba el paso a revisión técnica (PENDING_TECHNICIAN)
   * - false → observa el expediente (OBSERVED), que regresa al responsable para correcciones
   */
  @ApiProperty({
    example: true,
    description: 'true: aprobar y pasar a técnico | false: observar y devolver para correcciones.',
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    example: 'Documentación completa. Identidad verificada. Se remite a inspección técnica.',
    description: 'Observaciones o motivo del rechazo.',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
