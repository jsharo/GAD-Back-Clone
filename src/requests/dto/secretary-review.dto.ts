import { IsBoolean, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SecretaryReviewDto — Cuerpo de la decisión de la secretaría sobre un trámite.
 *
 * Flujo (actualizado — verificación NO bloqueante):
 *  - signature_validated=false  → Alerta informativa en historial (NO bloquea el avance).
 *  - approved=false             → Estado OBSERVED; el expediente regresa al ciudadano/profesional.
 *  - approved=true              → Estado PENDING_TECHNICIAN (con o sin firma validada).
 */
export class SecretaryReviewDto {
  /**
   * Indica que la secretaria verificó manualmente que el PDF del profesional
   * habilitado contiene una firma digital válida.
   * Si es `false`, el sistema registra una alerta informativa pero permite continuar.
   */
  @ApiProperty({
    example: true,
    description:
      'Resultado de la verificación manual de la firma digital del profesional en el PDF adjunto. ' +
      'Si es false, se genera una alerta informativa en el historial pero el expediente puede avanzar.',
  })
  @IsBoolean()
  signature_validated: boolean;

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
    example: 'Documentación completa. Firma validada. Se remite a inspección técnica.',
    description: 'Observaciones o motivo del rechazo.',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
