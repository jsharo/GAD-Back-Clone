import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AttachmentFolder {
  PLANOS            = 'PLANOS',
  DOCUMENTOS_LEGALES = 'DOCUMENTOS_LEGALES',
  INFORMES          = 'INFORMES',
  OTROS             = 'OTROS',
}

export class UploadAttachmentDto {
  /**
   * Destination folder for the document within the request file.
   * - PLANOS: Architectural / technical plans
   * - DOCUMENTOS_LEGALES: Deed, ID card, property title
   * - INFORMES: Technical and inspection reports
   * - OTROS: Any other supporting document
   */
  @ApiProperty({
    enum: AttachmentFolder,
    example: AttachmentFolder.PLANOS,
    description: 'Request file folder where the document is archived.',
  })
  @IsEnum(AttachmentFolder)
  folder: AttachmentFolder;

  @ApiPropertyOptional({
    example: 'Site plan — Ground floor',
    description: 'Descriptive document name. If omitted, the original file name is used.',
  })
  @IsString()
  @IsOptional()
  name?: string;
}
