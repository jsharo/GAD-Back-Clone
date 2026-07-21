import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiProduces,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { RequestService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { InspectionReportDto } from './dto/inspection-report.dto';
import { ResolveRequestDto } from './dto/resolve-request.dto';
import { SecretaryReviewDto } from './dto/secretary-review.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import {
  createDocumentFileFilter,
  MAX_DOCUMENT_FILE_SIZE,
  sanitizeDocumentDisplayName,
} from './document-security';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('requests')
export class RequestController {
  constructor(private readonly request_service: RequestService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR SOLICITUD
  // Ciudadano: POST /requests  (citizen_id se toma del JWT)
  // Profesional: POST /requests  con citizen_id en el body
  // ──────────────────────────────────────────────────────────────────────────
  @Post()
  @Roles(Role.CITIZEN, Role.USER, Role.ADMINISTRATOR)
  @RequirePermissions('requests.write')
  @ApiOperation({
    summary: 'Create a procedure request',
    description:
      'A citizen creates the request directly. ' +
      'A licensed professional (ARCHITECT) creates the request on behalf of the property owner ' +
      'by providing "citizen_id" in the body. ' +
      'The system validates that the professional is authorized and that the procedure type prerequisites are met.',
  })
  async create(@Body() create_dto: CreateRequestDto, @CurrentUser() user: any) {
    const data = await this.request_service.create(create_dto, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LISTAR SOLICITUDES
  // ──────────────────────────────────────────────────────────────────────────
  @Get('my-requests')
  @ApiOperation({ summary: 'Requests for the authenticated citizen' })
  async findMine(@CurrentUser() user: any) {
    const data = await this.request_service.findByCitizen(user.id);
    return { success: true, data };
  }

  @Get('my-filings')
  @Roles(Role.USER, Role.ADMINISTRATOR)
  @RequirePermissions('requests.read', 'requests.write')
  @ApiOperation({ summary: 'Request files submitted by the authenticated professional' })
  async findMyFilings(@CurrentUser() user: any) {
    const data = await this.request_service.findByArchitect(user.id);
    return { success: true, data };
  }

  @Get()
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR, Role.TECHNICIAN, Role.FINANCIAL)
  @RequirePermissions('requests.read', 'requests.review')
  @ApiOperation({ summary: 'List all requests (optional status filter)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by request status' })
  async findAll(@Query('status') status?: string) {
    const data = await this.request_service.findAll(status);
    return { success: true, data };
  }

  @Get(':id/traceability')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({
    summary: 'Get request traceability report',
    description:
      'Consolidates request, history, attachments, SHA-256 integrity, IPFS, blockchain and related audit events.',
  })
  @ApiResponse({ status: 200, description: 'Traceability report generated successfully.' })
  @ApiResponse({ status: 401, description: 'Authentication token is missing or invalid.' })
  @ApiResponse({ status: 403, description: 'User does not have access to this request.' })
  @ApiResponse({ status: 404, description: 'Request was not found.' })
  async getTraceabilityReport(@Param('id') id: string, @CurrentUser() user: any) {
    const data = await this.request_service.getTraceabilityReport(id, user);
    return { success: true, data };
  }

  @Get(':id/signature-verification')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Verify PDF signatures and expected identity across all attachments',
    description:
      'Extracts each signature and certificate, checks cryptographic integrity, and compares the ' +
      'national ID available in the certificate with the person responsible for the request file.',
  })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  async verifyRequestSignatures(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('refresh') refresh?: string,
  ) {
    const data = await this.request_service.verifyRequestSignatures(
      id,
      user,
      refresh === 'true',
    );
    return { success: true, data };
  }

  @Get(':id')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({ summary: 'Full request details' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const data = await this.request_service.findOne(id, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REVISIÓN DE SECRETARÍA — Validación de firma + decisión de avance
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/secretary-review')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @RequirePermissions('requests.review')
  @ApiOperation({
    summary: 'Secretary review: record signature and approve/observe the request file',
    description:
      'The secretary manually verifies the professional\'s digital signature on the attached PDF. ' +
      'If the signature is not validated (signature_validated=false), the system records an informational alert and allows proceeding. ' +
      'If approved (approved=true) → status PENDING_TECHNICIAN. ' +
      'If observed (approved=false) → status OBSERVED; the request file returns to the professional/citizen.',
  })
  async secretaryReview(
    @Param('id') id: string,
    @Body() review_dto: SecretaryReviewDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.secretaryReview(id, review_dto, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZACIÓN DE ESTADO GENÉRICA (FINANCIAL / SUPERADMIN)
  // ──────────────────────────────────────────────────────────────────────────
  @Patch(':id/status')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR, Role.TECHNICIAN, Role.FINANCIAL)
  @RequirePermissions('requests.review')
  @ApiOperation({
    summary: 'Update request status (general use)',
    description: 'For manual transitions such as PAID → APPROVED. The secretary uses /secretary-review.',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() update_dto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.updateStatus(id, update_dto, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PROGRAMAR INSPECCIÓN
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/schedule')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @RequirePermissions('requests.review')
  @ApiOperation({ summary: 'Schedule technical inspection → INSPECTION status' })
  async scheduleInspection(
    @Param('id') id: string,
    @Body() schedule_dto: ScheduleInspectionDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.scheduleInspection(id, schedule_dto, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INFORME DE INSPECCIÓN (con fotos)
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/inspection-report')
  @Roles(Role.TECHNICIAN, Role.ADMINISTRATOR)
  @RequirePermissions('requests.review')
  @ApiOperation({ summary: 'Upload technical inspection report and photos' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('photos', 5, {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 5 },
      fileFilter: createDocumentFileFilter('inspection-image'),
    }),
  )
  async uploadInspectionReport(
    @Param('id') id: string,
    @Body() report_dto: InspectionReportDto,
    @UploadedFiles() photos: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.uploadInspectionReport(id, report_dto, photos, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RESOLUCIÓN — el sistema calcula el monto automáticamente
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/resolve')
  @Roles(Role.TECHNICIAN, Role.SECRETARY, Role.ADMINISTRATOR, Role.FINANCIAL)
  @RequirePermissions('requests.review')
  @ApiOperation({
    summary: 'Resolve the request (approve or reject)',
    description:
      'If approved, the system automatically calculates the payment amount based on the procedure type, ' +
      'the property zone, and the area in m². The professional does NOT enter the amount manually. ' +
      'Resulting status: PENDING_PAYMENT (approved) or REJECTED (rejected).',
  })
  async resolve(
    @Param('id') id: string,
    @Body() resolve_dto: ResolveRequestDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.resolve(id, resolve_dto, user);
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SISTEMA DE ARCHIVOS POR CARPETAS DEL EXPEDIENTE
  // ──────────────────────────────────────────────────────────────────────────

  @Post(':id/attachments')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({
    summary: 'Upload document to the request file by folder',
    description:
      'Attaches a file to the request file in the specified folder: ' +
      'PLANOS, DOCUMENTOS_LEGALES, INFORMES, or OTROS. ' +
      'The system calculates and stores the SHA-256 hash; if it replaces a document with the same name/folder but a different hash, it records an informational alert.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', enum: ['PLANOS', 'DOCUMENTOS_LEGALES', 'INFORMES', 'OTROS'] },
        name: { type: 'string' },
      },
      required: ['file', 'folder'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 1 },
      fileFilter: createDocumentFileFilter(),
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.uploadAttachment(id, dto, file, user);
    return { success: true, data };
  }

  @Get(':id/attachments')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({
    summary: 'List request file documents',
    description: 'Optionally filter by folder: ?folder=PLANOS',
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    enum: ['PLANOS', 'DOCUMENTOS_LEGALES', 'INFORMES', 'OTROS'],
  })
  async listAttachments(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('folder') folder?: string,
  ) {
    const data = await this.request_service.listAttachments(id, folder, user);
    return { success: true, data };
  }

  @Get(':id/attachments/:attachmentId/download')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({ summary: 'Download or view a request file document' })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description: 'Binary document content.',
    schema: { type: 'string', format: 'binary' },
  })
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.request_service.downloadAttachment(
      id,
      attachment_id,
      user,
    );
    const content_type = file.attachment.type || 'application/octet-stream';
    const inline_types = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    const disposition = inline_types.has(content_type)
      ? 'inline'
      : 'attachment';
    const encoded_name = encodeURIComponent(
      sanitizeDocumentDisplayName(file.attachment.name),
    );

    response.setHeader('Content-Type', content_type);
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encoded_name}`,
    );
    response.setHeader('Content-Length', file.file_size.toString());
    response.setHeader('X-Content-Type-Options', 'nosniff');

    return new StreamableFile(createReadStream(file.file_path));
  }

  @Get(':id/attachments/:attachmentId/verify')
  @Roles(
    Role.CITIZEN,
    Role.USER,
    Role.SECRETARY,
    Role.TECHNICIAN,
    Role.FINANCIAL,
    Role.ADMINISTRATOR,
  )
  @ApiOperation({ summary: 'Verify SHA-256 integrity of a request file document' })
  async verifyAttachmentIntegrity(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
  ) {
    return this.request_service.verifyAttachmentIntegrity(
      id,
      attachment_id,
      user,
    );
  }

  @Get(':id/attachments/:attachmentId/signatures')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Extract and verify all signatures on a request file PDF',
  })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  async verifyAttachmentSignatures(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
    @Query('refresh') refresh?: string,
  ) {
    const data = await this.request_service.verifyAttachmentSignatures(
      id,
      attachment_id,
      user,
      refresh === 'true',
    );
    return { success: true, data };
  }

  @Post(':id/attachments/:attachmentId/ipfs')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @ApiOperation({ summary: 'Manually upload a document to IPFS' })
  async uploadAttachmentToIpfs(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
  ) {
    return this.request_service.uploadAttachmentToIpfs(
      id,
      attachment_id,
      user,
    );
  }

  @Post(':id/attachments/:attachmentId/blockchain')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @ApiOperation({ summary: 'Anchor document evidence on blockchain' })
  async anchorAttachmentEvidence(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
  ) {
    return this.request_service.anchorAttachmentEvidence(
      id,
      attachment_id,
      user,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(Role.SECRETARY, Role.USER, Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Delete a request file document (physical file + record)' })
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachment_id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.deleteAttachment(id, attachment_id, user);
    return { success: true, data };
  }
}
