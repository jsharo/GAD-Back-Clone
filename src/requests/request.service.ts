import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeeRulesService } from './fee-rules.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { InspectionReportDto } from './dto/inspection-report.dto';
import { ResolveRequestDto } from './dto/resolve-request.dto';
import { SecretaryReviewDto } from './dto/secretary-review.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { RequestStatus } from '../common/enums/request-status.enum';
import { Role } from '../common/enums/role.enum';
import { PropertyZone, RequestType } from '@prisma/client';
import { IpfsService } from '../ipfs/ipfs.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { DocumentSignatureService } from '../signatures/document.signature.service';
import { SignatureProfileService } from '../signatures/signature.profile.service';
import { ProfessionalVerificationService } from '../users/professional-verification.service';
import {
  AttachmentSignatureReport,
  ExpectedSigner,
  RequestSignatureSummary,
} from '../signatures/signature.verification.types';
import {
  createSafeInspectionStorageLocation,
  createSafeStorageLocation,
  ensurePathInsideRoot,
  validateDocumentFile,
} from './document-security';

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit_service: AuditService,
    private readonly fee_rules_service: FeeRulesService,
    private readonly ipfs_service: IpfsService,
    private readonly blockchain_service: BlockchainService,
    private readonly document_signature_service: DocumentSignatureService,
    private readonly signature_profile_service: SignatureProfileService,
    private readonly professionalVerification: ProfessionalVerificationService,
  ) {}

  private writeDocumentFile(file_path: string, buffer: Buffer) {
    try {
      fs.writeFileSync(file_path, buffer, { flag: 'wx' });
    } catch {
      throw new InternalServerErrorException(
        'The file could not be stored securely.',
      );
    }
  }

  private removeDocumentFile(file_path: string) {
    try {
      if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    } catch {
      // The original controlled error remains the response; no path is exposed.
    }
  }

  private hashStoredDocument(file_path: string) {
    return createHash('sha256').update(fs.readFileSync(file_path)).digest('hex');
  }

  private toPublicAttachment(attachment: any) {
    const public_attachment = { ...attachment };
    delete public_attachment.url;
    return public_attachment;
  }

  private async validateRequestAccess(
    request_id: string,
    active_user: any,
    options: { allow_delete?: boolean } = {},
  ) {
    const request = await this.prisma.request.findUnique({
      where: { id: request_id },
      select: {
        id: true,
        status: true,
        citizen_id: true,
        architect_id: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    const role = active_user?.role as Role;
    const is_administrator = role === Role.ADMINISTRATOR;
    const is_citizen_owner =
      role === Role.CITIZEN && request.citizen_id === active_user?.id;
    const is_professional_owner =
      role === Role.USER && request.architect_id === active_user?.id;

    if (options.allow_delete) {
      const can_delete =
        is_administrator || role === Role.SECRETARY || is_professional_owner;

      if (!can_delete) {
        throw new ForbiddenException(
          'You do not have permission to delete documents from this request file.',
        );
      }

      return request;
    }

    const institutional_roles: Role[] = [
      Role.SECRETARY,
      Role.TECHNICIAN,
      Role.FINANCIAL,
    ];
    const is_institutional = institutional_roles.includes(role);

    if (
      !is_administrator &&
      !is_institutional &&
      !is_citizen_owner &&
      !is_professional_owner
    ) {
      throw new ForbiddenException(
        'You do not have permission to access this request file.',
      );
    }

    return request;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PREREQUISITE GUARD
  // Para PLAN_APPROVAL: el ciudadano debe tener una BUILDING_LINE APROBADA.
  // ──────────────────────────────────────────────────────────────────────────
  private async checkBuildingLinePrerequisite(citizen_id: string): Promise<void> {
    const approved_building_line = await this.prisma.request.findFirst({
      where: {
        citizen_id,
        request_type: RequestType.BUILDING_LINE,
        status: RequestStatus.APPROVED,
      },
    });

    if (!approved_building_line) {
      throw new BadRequestException(
        'To request a Plan Approval, the citizen must have a previously APPROVED Building Line. ' +
        'Please process the Building Line first.',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE
  // Soporta dos modos:
  //   1. Ciudadano crea directamente → citizen_id = user.id, architect_id = null
  //   2. Arquitecto habilitado crea en nombre del ciudadano →
  //        citizen_id = dto.citizen_id, architect_id = user.id
  // ──────────────────────────────────────────────────────────────────────────
  async create(create_dto: CreateRequestDto, active_user: any) {
    const acting_role: Role = active_user.role as Role;

    // ── Determinar citizen_id y architect_id según el rol ──────────────────
    let effective_citizen_id: string;
    let architect_id: string | null = null;

    if (acting_role === Role.USER) {
      await this.professionalVerification.assertCanCreateProcedures(active_user.id);

      if (!create_dto.citizen_id) {
        throw new BadRequestException(
          'The licensed professional must specify the property owner\'s "citizen_id".',
        );
      }

      // Verificar que el ciudadano propietario exista
      const citizen = await this.prisma.user.findFirst({
        where: {
          id: create_dto.citizen_id,
          deletedAt: null,
          roleAssignments: { some: { role: { name: Role.CITIZEN } } },
        },
        select: { id: true },
      });
      if (!citizen) {
        throw new NotFoundException(
          `No citizen was found with id: ${create_dto.citizen_id}`,
        );
      }

      effective_citizen_id = citizen.id;
      architect_id = active_user.id;
    } else {
      // Ciudadano crea directamente
      effective_citizen_id = active_user.id;
    }

    // ── Guard: PLAN_APPROVAL requiere BUILDING_LINE aprobada ───────────────
    if (create_dto.request_type === RequestType.PLAN_APPROVAL) {
      await this.checkBuildingLinePrerequisite(effective_citizen_id);
    }

    // 1. Crear Predio
    const property = await this.prisma.property.create({
      data: {
        cadastral_key: create_dto.property.cadastral_key || null,
        address: create_dto.property.address,
        area: create_dto.property.area || null,
        zone: create_dto.property.zone as PropertyZone,
      },
    });

    // 2. Crear Solicitud
    const request = await this.prisma.request.create({
      data: {
        request_type: create_dto.request_type,
        status: RequestStatus.PENDING_SECRETARY,
        citizen_id: effective_citizen_id,
        architect_id,
        property_id: property.id,
      },
    });

    // 3. Primera entrada en el historial
    const responsible_label = architect_id
      ? `Professional: ${active_user.email} on behalf of the citizen`
      : active_user.email;

    await this.prisma.requestHistory.create({
      data: {
        previous_status: 'NONE',
        new_status: RequestStatus.PENDING_SECRETARY,
        comment: architect_id
          ? `Request file submitted by licensed professional (${active_user.email}) on behalf of the property owner.`
          : 'Request registered by the citizen.',
        responsible: responsible_label,
        request_id: request.id,
      },
    });

    // 4. Auditoría
    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'CREATE_REQUEST',
      `Request created for the property at ${property.address} — type: ${request.request_type}` +
      (architect_id ? ` — by licensed professional` : ''),
    );

    return request;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LIST
  // ──────────────────────────────────────────────────────────────────────────
  async findAll(status?: string) {
    const query_options: any = {
      include: {
        citizen: {
          select: { id: true, email: true, name: true, lastname: true },
        },
        architect: {
          select: { id: true, email: true, name: true, lastname: true },
        },
        property: true,
      },
      orderBy: { created_at: 'desc' },
    };

    if (status && Object.values(RequestStatus).includes(status as any)) {
      query_options.where = { status: status as RequestStatus };
    }

    return this.prisma.request.findMany(query_options);
  }

  async findByCitizen(citizen_id: string) {
    return this.prisma.request.findMany({
      where: { citizen_id },
      include: { property: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByArchitect(architect_id: string) {
    return this.prisma.request.findMany({
      where: { architect_id },
      include: {
        citizen: {
          select: { id: true, email: true, name: true, lastname: true },
        },
        property: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        citizen: {
          select: { id: true, email: true, name: true, lastname: true, cedula: true },
        },
        architect: {
          select: { id: true, email: true, name: true, lastname: true, cedula: true },
        },
        property: true,
        attachments: { orderBy: [{ folder: 'asc' }, { created_at: 'asc' }] },
        history: { orderBy: { created_at: 'desc' } },
        inspection: true,
        resolution: true,
        secretary_decision: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    return request;
  }

  async getTraceabilityReport(id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const request = await this.prisma.request.findUnique({
      where: { id },
      select: {
        id: true,
        request_type: true,
        status: true,
        created_at: true,
        updated_at: true,
        history: {
          select: {
            id: true,
            previous_status: true,
            new_status: true,
            comment: true,
            responsible: true,
            created_at: true,
          },
          orderBy: { created_at: 'asc' },
        },
        attachments: {
          select: {
            id: true,
            name: true,
            type: true,
            size: true,
            folder: true,
            hash: true,
            ipfs_cid: true,
            ipfs_status: true,
            ipfs_uploaded_at: true,
            ipfs_provider: true,
            blockchain_status: true,
            blockchain_tx_hash: true,
            blockchain_anchored_at: true,
            blockchain_network: true,
            blockchain_contract_address: true,
            blockchain_evidence_id: true,
            created_at: true,
            url: true,
          },
          orderBy: [{ folder: 'asc' }, { created_at: 'asc' }],
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found.');
    }

    const attachments = request.attachments.map((attachment) => {
      const integrity = this.getAttachmentIntegritySnapshot(attachment);

      return {
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        folder: attachment.folder,
        created_at: attachment.created_at,
        sha256_hash: attachment.hash,
        integrity,
        ipfs: {
          status: attachment.ipfs_status,
          cid: attachment.ipfs_cid,
          provider: attachment.ipfs_provider,
          uploaded_at: attachment.ipfs_uploaded_at,
        },
        blockchain: {
          status: attachment.blockchain_status,
          evidence_id: attachment.blockchain_evidence_id,
          transaction_hash: attachment.blockchain_tx_hash,
          network: attachment.blockchain_network,
          contract_address: attachment.blockchain_contract_address,
          anchored_at: attachment.blockchain_anchored_at,
        },
      };
    });

    const traceability_terms = [
      request.id,
      ...request.attachments.map((attachment) => attachment.id),
    ];
    const audit_events = await this.prisma.auditLog.findMany({
      where: {
        OR: traceability_terms.map((term) => ({
          details: { contains: term },
        })),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        action: true,
        user_email: true,
        created_at: true,
        current_hash: true,
        user: {
          select: {
            roleAssignments: {
              select: { role: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    });

    return {
      request: {
        id: request.id,
        request_type: request.request_type,
        status: request.status,
        created_at: request.created_at,
        updated_at: request.updated_at,
      },
      history: request.history.map((item) => ({
        id: item.id,
        previous_status: item.previous_status,
        new_status: item.new_status,
        status: item.new_status,
        comment: item.comment,
        responsible: item.responsible,
        created_at: item.created_at,
      })),
      attachments,
      audit_events: audit_events.map((event) => ({
        action: event.action,
        actor_email: event.user_email,
        actor_role: event.user?.roleAssignments?.[0]?.role.name ?? null,
        created_at: event.created_at,
        current_hash: event.current_hash,
      })),
      summary: {
        attachments_total: attachments.length,
        attachments_with_hash: attachments.filter((attachment) => attachment.sha256_hash).length,
        attachments_integrity_valid: attachments.filter(
          (attachment) => attachment.integrity.verifiable && attachment.integrity.valid,
        ).length,
        attachments_ipfs_uploaded: attachments.filter(
          (attachment) => attachment.ipfs.status === 'UPLOADED' && attachment.ipfs.cid,
        ).length,
        attachments_blockchain_anchored: attachments.filter(
          (attachment) =>
            attachment.blockchain.status === 'ANCHORED' &&
            attachment.blockchain.transaction_hash,
        ).length,
        audit_events_total: audit_events.length,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPDATE STATUS (generic — for FINANCIAL/SUPERADMIN manual transitions)
  // ──────────────────────────────────────────────────────────────────────────
  async updateStatus(id: string, update_dto: UpdateStatusDto, active_user: any) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');

    const updated = await this.prisma.request.update({
      where: { id },
      data: { status: update_dto.status },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: update_dto.status,
        comment: update_dto.comment || 'Status updated manually.',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPDATE_REQUEST_STATUS',
      `Status updated: ${request.status} → ${update_dto.status}`,
    );

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECRETARY REVIEW — Validación de firma + decisión de avance
  // ──────────────────────────────────────────────────────────────────────────
  async secretaryReview(id: string, review_dto: SecretaryReviewDto, active_user: any) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');

    // Solo se puede revisar si el expediente está en PENDING_SECRETARY u OBSERVED
    const reviewable_states = [RequestStatus.PENDING_SECRETARY, RequestStatus.OBSERVED];
    if (!reviewable_states.includes(request.status as RequestStatus)) {
      throw new BadRequestException(
        `The request file is in "${request.status}" status and cannot be reviewed by the secretary at this time.`,
      );
    }

    const signature_summary = await this.collectRequestSignatureSummary(id, false);
    const signature_validated = signature_summary.has_valid_expected_signature;
    const signature_requires_acknowledgement =
      signature_summary.requires_acknowledgement ?? signature_summary.status !== 'MATCH';

    if (
      review_dto.approved &&
      signature_requires_acknowledgement &&
      !review_dto.acknowledge_signature_warning
    ) {
      throw new BadRequestException(
        'Signature verification contains differences, uncertainties, or trust warnings. ' +
          'Review the details and explicitly confirm if you wish to proceed.',
      );
    }

    if (review_dto.approved && signature_requires_acknowledgement) {
      await this.prisma.requestHistory.create({
        data: {
          previous_status: request.status,
          new_status: request.status,
          comment:
            'SIGNATURE ALERT: The secretary approved the request file after acknowledging ' +
            `verifier warnings. Automatic status: ${signature_summary.status}.`,
          responsible: 'SISTEMA',
          request_id: id,
        },
      });
    }

    // ── Determinar nuevo estado ────────────────────────────────────────────
    let new_status: RequestStatus;
    let history_comment: string;

    if (!review_dto.approved) {
      new_status = RequestStatus.OBSERVED;
      history_comment =
        `Request file observed by the secretary. ` +
        (review_dto.remarks ? `Reason: ${review_dto.remarks}` : 'No additional remarks.');
    } else {
      new_status = RequestStatus.PENDING_TECHNICIAN;
      history_comment =
        (!signature_requires_acknowledgement
          ? `Signature, identity, and trust verified automatically; request file approved by the secretary. `
          : `Request file approved with automatic signature alert (${signature_summary.status}); ` +
            `the secretary confirmed they wish to proceed. `) +
        `Forwarded for technical review. ` +
        (review_dto.remarks ? review_dto.remarks : '');
    }

    // ── Persistir decisión de la secretaría ───────────────────────────────
    await this.prisma.secretaryDecision.upsert({
      where: { request_id: id },
      create: {
        approved: review_dto.approved,
        remarks: review_dto.remarks || null,
        signature_validated,
        request_id: id,
        secretary_id: active_user.id,
      },
      update: {
        approved: review_dto.approved,
        remarks: review_dto.remarks || null,
        signature_validated,
        secretary_id: active_user.id,
      },
    });

    // ── Actualizar estado del request ──────────────────────────────────────
    await this.prisma.request.update({
      where: { id },
      data: { status: new_status },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status,
        comment: history_comment,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'SECRETARY_REVIEW',
      `Secretary review of request file ${id}: approved=${review_dto.approved}, ` +
        `signature_validated=${signature_validated}, signature_status=${signature_summary.status}, ` +
        `expected_signer_id=${request.architect_id ?? request.citizen_id ?? 'UNDEFINED'}, ` +
        `new status=${new_status}`,
    );

    return {
      id,
      status: new_status,
      signature_validated,
      signature_status: signature_summary.status,
      approved: review_dto.approved,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCHEDULE INSPECTION
  // ──────────────────────────────────────────────────────────────────────────
  async scheduleInspection(id: string, schedule_dto: ScheduleInspectionDto, active_user: any) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');

    await this.prisma.inspection.upsert({
      where: { request_id: id },
      create: {
        date: new Date(schedule_dto.date),
        technician: schedule_dto.technician,
        comments: schedule_dto.comments || null,
        request_id: id,
      },
      update: {
        date: new Date(schedule_dto.date),
        technician: schedule_dto.technician,
        comments: schedule_dto.comments || null,
      },
    });

    await this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.INSPECTION },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: RequestStatus.INSPECTION,
        comment:
          schedule_dto.comments ||
          `Technical visit scheduled for inspector: ${schedule_dto.technician}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'SCHEDULE_INSPECTION',
      `Inspection scheduled for request file ${id} — inspector: ${schedule_dto.technician}`,
    );

    return { id, status: RequestStatus.INSPECTION };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPLOAD INSPECTION REPORT (with photos)
  // ──────────────────────────────────────────────────────────────────────────
  async uploadInspectionReport(
    id: string,
    report_dto: InspectionReportDto,
    photos: Express.Multer.File[],
    active_user: any,
  ) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Request not found.');

    const inspection = await this.prisma.inspection.findUnique({ where: { request_id: id } });
    if (!inspection) {
      throw new NotFoundException('No inspection is scheduled for this request.');
    }

    const photo_urls: string[] = [];
    if (photos && photos.length > 0) {
      const validated_photos = photos.map((file) => ({
        file,
        validated: validateDocumentFile(file, 'inspection-image'),
      }));

      for (const { file, validated } of validated_photos) {
        const storage = createSafeInspectionStorageLocation(validated.extension);
        this.writeDocumentFile(storage.file_path, file.buffer);
        const hash = this.hashStoredDocument(storage.file_path);

        try {
          await this.prisma.attachment.create({
            data: {
              name: validated.display_name,
              type: validated.mime_type,
              url: storage.url,
              size: file.buffer.length,
              hash,
              folder: 'INFORMES',
              request_id: id,
            },
          });
        } catch {
          this.removeDocumentFile(storage.file_path);
          throw new InternalServerErrorException(
            'The inspection file could not be registered.',
          );
        }

        photo_urls.push(storage.url);

        await this.audit_service.logAction(
          active_user.id,
          active_user.email,
          'UPLOAD_INSPECTION_FILE',
          `Inspection file uploaded for request ${id}: ${validated.display_name}, sha256=${hash}`,
        );
      }
    }

    await this.prisma.inspection.update({
      where: { request_id: id },
      data: {
        comments: report_dto.comments || inspection.comments,
        photos: photo_urls,
      },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: request.status,
        comment: 'Technical inspection report uploaded with photographic evidence.',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_INSPECTION_REPORT',
      `Inspection report uploaded for request ${id}`,
    );

    return { id, status: request.status };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RESOLVE — El sistema calcula automáticamente el monto a pagar
  // ──────────────────────────────────────────────────────────────────────────
  async resolve(id: string, resolve_dto: ResolveRequestDto, active_user: any) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!request) throw new NotFoundException('Request not found.');

    let target_state: RequestStatus;
    let payment_amount: number | null = null;
    let calculation_detail: string | null = null;
    let items: string[] = [];

    const is_approved = resolve_dto.approved !== false;

    if (is_approved) {
      // ── CÁLCULO AUTOMÁTICO DEL MONTO ─────────────────────────────────────
      const fee = await this.fee_rules_service.calculateFee(
        request.request_type,
        request.property!.zone,
        request.property!.area,
      );
      payment_amount     = fee.total;
      calculation_detail = JSON.stringify(fee);
      items              = [fee.description, fee.breakdown];
      target_state       = RequestStatus.PENDING_PAYMENT;
    } else {
      target_state = RequestStatus.REJECTED;
    }

    await this.prisma.resolution.upsert({
      where: { request_id: id },
      create: {
        comments: resolve_dto.comments,
        payment_amount,
        items,
        calculation_detail,
        auto_calculated: is_approved,
        request_id: id,
      },
      update: {
        comments: resolve_dto.comments,
        payment_amount,
        items,
        calculation_detail,
        auto_calculated: is_approved,
      },
    });

    await this.prisma.request.update({ where: { id }, data: { status: target_state } });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: target_state,
        comment: is_approved
          ? `Favorable resolution — amount calculated automatically: $${payment_amount}. ${resolve_dto.comments}`
          : `Request rejected: ${resolve_dto.comments}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'RESOLVE_REQUEST',
      `Request resolved → ${target_state}. Amount: $${payment_amount ?? 'N/A'}`,
    );

    return {
      id,
      status: target_state,
      payment_amount,
      calculation_detail: is_approved ? JSON.parse(calculation_detail!) : null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ATTACHMENT — Sistema de archivos por carpetas del expediente
  // ──────────────────────────────────────────────────────────────────────────

  /** Sube un documento al expediente, clasificándolo en la carpeta indicada.
   *  Incluye verificación no-bloqueante de hash: si se reemplaza un documento
   *  (mismo nombre o carpeta) y el hash SHA-256 cambió, genera una alerta
   *  en el historial para la secretaría. */
  async uploadAttachment(
    id: string,
    dto: UploadAttachmentDto,
    file: Express.Multer.File,
    active_user: any,
  ) {
    const access_context = await this.validateRequestAccess(id, active_user);
    const validated_file = validateDocumentFile(file, 'document', dto.name);

    // ── Detección de cambio de hash (NO bloqueante) ─────────────────────────
    const doc_name = validated_file.display_name;
    const previous_attachment = await this.prisma.attachment.findFirst({
      where: {
        request_id: id,
        folder: dto.folder,
        name: doc_name,
      },
      orderBy: { created_at: 'desc' },
    });

    const storage = createSafeStorageLocation(
      id,
      dto.folder,
      validated_file.extension,
    );
    this.writeDocumentFile(storage.file_path, file.buffer);
    const hash = this.hashStoredDocument(storage.file_path);

    // Crear registro en BD
    let attachment: any;
    try {
      attachment = await this.prisma.attachment.create({
        data: {
          name: doc_name,
          type: validated_file.mime_type,
          url: storage.url,
          size: file.buffer.length,
          hash,
          folder: dto.folder,
          request_id: id,
        },
      });
    } catch {
      this.removeDocumentFile(storage.file_path);
      throw new InternalServerErrorException(
        'The attachment could not be registered.',
      );
    }

    if (previous_attachment?.hash && previous_attachment.hash !== hash) {
      await this.prisma.requestHistory.create({
        data: {
          previous_status: access_context.status,
          new_status: access_context.status,
          comment:
            `INTEGRITY ALERT: Document "${doc_name}" in folder ${dto.folder} ` +
            `was replaced and its SHA-256 hash changed. ` +
            `Previous hash: ${previous_attachment.hash.substring(0, 16)}... → ` +
            `New hash: ${hash.substring(0, 16)}... ` +
            `Uploaded by: ${active_user.email}`,
          responsible: 'SISTEMA',
          request_id: id,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'HASH_CHANGE_ALERT',
        `Signature hash changed on doc "${doc_name}" in request file ${id}. ` +
        `Previous: ${previous_attachment.hash.substring(0, 16)}... → New: ${hash.substring(0, 16)}...`,
      );
    }

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_ATTACHMENT',
      `Document "${attachment.name}" uploaded to folder ${dto.folder} in request file ${id}, sha256=${hash.substring(0, 16)}...`,
    );

    // Si el arquitecto sube un PDF firmado, verificar y capturar su certificado
    if (
      this.isPdfAttachment(attachment) &&
      access_context.architect_id === active_user.id
    ) {
      try {
        const expected_signer = await this.getExpectedSigner(id);
        const report = await this.verifyPdfAttachmentRecord(
          attachment,
          expected_signer,
          true,
        );
        return {
          ...this.toPublicAttachment({
            ...attachment,
            signature_status: report.status,
            signature_report: report,
            signature_verified_at: new Date(report.verified_at),
            signature_verifier: report.verifier,
          }),
          signature_profile_captured: report.has_valid_expected_signature,
        };
      } catch {
        // La subida ya fue exitosa; la verificación puede reintentarse después
      }
    }

    return this.toPublicAttachment(attachment);
  }

  /** Lista los adjuntos de un expediente, con filtro opcional por carpeta. */
  async listAttachments(id: string, folder: string | undefined, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const where: any = { request_id: id };
    if (folder) where.folder = folder;

    const attachments = await this.prisma.attachment.findMany({
      where,
      orderBy: [{ folder: 'asc' }, { created_at: 'asc' }],
    });
    return attachments.map((attachment) => this.toPublicAttachment(attachment));
  }

  private isPdfAttachment(attachment: any) {
    return (
      attachment?.type === 'application/pdf' ||
      String(attachment?.name || '').toLowerCase().endsWith('.pdf')
    );
  }

  private async getExpectedSigner(request_id: string): Promise<ExpectedSigner> {
    const request = await this.prisma.request.findUnique({
      where: { id: request_id },
      select: {
        citizen: { select: { id: true, name: true, lastname: true, cedula: true } },
        architect: { select: { id: true, name: true, lastname: true, cedula: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found.');

    const signer = request.architect || request.citizen;
    return {
      id: signer?.id || null,
      role: request.architect ? 'PROFESSIONAL' : request.citizen ? 'CITIZEN' : 'UNKNOWN',
      full_name: [signer?.name, signer?.lastname].filter(Boolean).join(' '),
      national_id: signer?.cedula || null,
    };
  }

  private async verifyPdfAttachmentRecord(
    attachment: any,
    expected_signer: ExpectedSigner,
    refresh: boolean,
  ): Promise<AttachmentSignatureReport> {
    const file = this.resolveAttachmentFile(attachment);
    const current_hash = this.hashStoredDocument(file.file_path);
    const storage_integrity_valid = !attachment.hash || attachment.hash === current_hash;
    const cached_report = attachment.signature_report as AttachmentSignatureReport | null;

    if (
      !refresh &&
      cached_report?.document_hash === current_hash &&
      cached_report?.expected_signer?.national_id === expected_signer.national_id
    ) {
      return cached_report;
    }

    const report = await this.document_signature_service.verifyPdf(
      file.file_path,
      current_hash,
      expected_signer,
    );
    const effective_report: AttachmentSignatureReport = {
      ...report,
      status: storage_integrity_valid ? report.status : 'INVALID',
      has_valid_expected_signature:
        storage_integrity_valid && report.has_valid_expected_signature,
      warnings: storage_integrity_valid
        ? report.warnings
        : [
            ...report.warnings,
            'The current content does not match the hash stored when the attachment was uploaded.',
          ],
      attachment_id: attachment.id,
      attachment_name: attachment.name,
      stored_hash: attachment.hash || null,
      storage_integrity_valid,
    };

    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        signature_status: effective_report.status,
        signature_report: effective_report as any,
        signature_verified_at: new Date(effective_report.verified_at),
        signature_verifier: effective_report.verifier,
      },
    });

    try {
      await this.signature_profile_service.captureFromVerifiedReport(
        expected_signer,
        effective_report,
        attachment.id,
      );
    } catch {
      // No bloquear la verificación del adjunto si falla el anclaje del perfil
    }

    return effective_report;
  }

  private async verifyPdfAttachmentSafely(
    attachment: any,
    expected_signer: ExpectedSigner,
    refresh: boolean,
  ): Promise<AttachmentSignatureReport> {
    try {
      return await this.verifyPdfAttachmentRecord(
        attachment,
        expected_signer,
        refresh,
      );
    } catch {
      const verified_at = new Date().toISOString();
      const report: AttachmentSignatureReport = {
        schema_version: 1,
        document_hash: attachment.hash || '',
        verified_at,
        verifier: 'unavailable',
        status: 'ERROR',
        engine_status: 'ERROR',
        engine_error_code: 'ATTACHMENT_READ_ERROR',
        trust_configured: false,
        network_validation_enabled: false,
        signature_count: 0,
        has_valid_expected_signature: false,
        expected_signer,
        signatures: [],
        warnings: [
          'The stored file could not be read to verify its signatures.',
        ],
        attachment_id: attachment.id,
        attachment_name: attachment.name,
        stored_hash: attachment.hash || null,
        storage_integrity_valid: false,
      };

      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          signature_status: report.status,
          signature_report: report as any,
          signature_verified_at: new Date(verified_at),
          signature_verifier: report.verifier,
        },
      });
      return report;
    }
  }

  private async collectRequestSignatureSummary(
    id: string,
    refresh: boolean,
  ): Promise<RequestSignatureSummary> {
    const expected_signer = await this.getExpectedSigner(id);
    const attachments = await this.prisma.attachment.findMany({
      where: { request_id: id },
      orderBy: { created_at: 'asc' },
    });
    const reports: AttachmentSignatureReport[] = [];

    for (const attachment of attachments.filter((item) => this.isPdfAttachment(item))) {
      reports.push(
        await this.verifyPdfAttachmentSafely(attachment, expected_signer, refresh),
      );
    }

    return this.document_signature_service.buildRequestSummary(reports, expected_signer);
  }

  async verifyRequestSignatures(id: string, active_user: any, refresh = false) {
    await this.validateRequestAccess(id, active_user);
    const summary = await this.collectRequestSignatureSummary(id, refresh);

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'VERIFY_REQUEST_SIGNATURES',
      JSON.stringify({
        requestId: id,
        status: summary.status,
        pdfCount: summary.pdf_count,
        signatureCount: summary.signature_count,
        hasExpectedSigner: summary.has_valid_expected_signature,
      }),
    );

    return summary;
  }

  async verifyAttachmentSignatures(
    id: string,
    attachment_id: string,
    active_user: any,
    refresh = false,
  ) {
    await this.validateRequestAccess(id, active_user);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this request file.');
    }
    if (!this.isPdfAttachment(attachment)) {
      throw new BadRequestException('Signature verification only supports PDF documents.');
    }

    const expected_signer = await this.getExpectedSigner(id);
    const report = await this.verifyPdfAttachmentSafely(
      attachment,
      expected_signer,
      refresh,
    );
    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'VERIFY_ATTACHMENT_SIGNATURES',
      JSON.stringify({
        requestId: id,
        attachmentId: attachment.id,
        status: report.status,
        signatureCount: report.signature_count,
        hasExpectedSigner: report.has_valid_expected_signature,
      }),
    );
    return report;
  }

  private resolveAttachmentStoragePath(attachment: any) {
    if (!attachment?.url || typeof attachment.url !== 'string') {
      throw new ForbiddenException('The document path is not valid.');
    }

    const uploads_root = path.resolve(process.cwd(), 'uploads');
    const relative_url = attachment.url.replace(/^[/\\]+/, '');
    const resolved_file_path = path.resolve(process.cwd(), relative_url);
    ensurePathInsideRoot(uploads_root, resolved_file_path);

    return { uploads_root, resolved_file_path };
  }

  /** Resuelve un adjunto autorizado a una ruta física segura para su entrega. */
  private resolveAttachmentFile(attachment: any) {
    const { uploads_root, resolved_file_path } =
      this.resolveAttachmentStoragePath(attachment);

    if (!fs.existsSync(resolved_file_path)) {
      throw new NotFoundException('The physical file does not exist.');
    }

    let real_uploads_root: string;
    let real_file_path: string;
    try {
      real_uploads_root = fs.realpathSync(uploads_root);
      real_file_path = fs.realpathSync(resolved_file_path);
    } catch {
      throw new NotFoundException('The physical file does not exist.');
    }

    const real_relative_path = path.relative(real_uploads_root, real_file_path);
    if (
      real_relative_path.startsWith('..') ||
      path.isAbsolute(real_relative_path)
    ) {
      throw new ForbiddenException('The document path is not valid.');
    }

    const file_stats = fs.statSync(real_file_path);
    if (!file_stats.isFile()) {
      throw new NotFoundException('The physical file does not exist.');
    }

    return {
      file_path: real_file_path,
      file_size: file_stats.size,
    };
  }

  private getAttachmentIntegritySnapshot(attachment: any) {
    try {
      const file = this.resolveAttachmentFile(attachment);
      const current_hash = createHash('sha256')
        .update(fs.readFileSync(file.file_path))
        .digest('hex');

      if (!attachment.hash) {
        return {
          verifiable: false,
          valid: false,
          stored_hash: null,
          current_hash,
          message: 'Attachment does not have a stored hash.',
        };
      }

      const valid = attachment.hash === current_hash;

      return {
        verifiable: true,
        valid,
        stored_hash: attachment.hash,
        current_hash,
        message: valid
          ? 'Attachment integrity is valid.'
          : 'Attachment integrity violation detected.',
      };
    } catch {
      return {
        verifiable: false,
        valid: false,
        stored_hash: attachment.hash || null,
        current_hash: null,
        message: 'Attachment file is not available for verification.',
      };
    }
  }

  async downloadAttachment(id: string, attachment_id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this request file.');
    }
    const file = this.resolveAttachmentFile(attachment);

    return {
      attachment,
      file_path: file.file_path,
      file_size: file.file_size,
    };
  }

  /** Elimina un adjunto del expediente (archivo físico + registro en BD). */
  async verifyAttachmentIntegrity(id: string, attachment_id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this request file.');
    }

    const file = this.resolveAttachmentFile(attachment);
    const current_hash = createHash('sha256')
      .update(fs.readFileSync(file.file_path))
      .digest('hex');

    const result = !attachment.hash
      ? {
        success: true,
        valid: false,
        verifiable: false,
        attachment_id: attachment.id,
        stored_hash: null,
        current_hash,
        message: 'Attachment does not have a stored hash.',
      }
      : {
        success: true,
        valid: attachment.hash === current_hash,
        verifiable: true,
        attachment_id: attachment.id,
        stored_hash: attachment.hash,
        current_hash,
        message:
          attachment.hash === current_hash
            ? 'Attachment integrity is valid.'
            : 'Attachment integrity violation detected.',
      };

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'VERIFY_ATTACHMENT_INTEGRITY',
      JSON.stringify({
        requestId: id,
        attachmentId: attachment.id,
        valid: result.valid,
        verifiable: result.verifiable,
      }),
    );

    return result;
  }

  async uploadAttachmentToIpfs(
    id: string,
    attachment_id: string,
    active_user: any,
  ) {
    await this.validateRequestAccess(id, active_user);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this request file.');
    }

    const file = this.resolveAttachmentFile(attachment);

    if (!this.ipfs_service.isEnabled()) {
      return {
        success: true,
        enabled: false,
        uploaded: false,
        ipfs_status: 'DISABLED',
        message: 'IPFS integration is disabled by configuration.',
      };
    }

    if (attachment.ipfs_cid) {
      return {
        success: true,
        enabled: true,
        uploaded: false,
        already_uploaded: true,
        attachment_id: attachment.id,
        ipfs_cid: attachment.ipfs_cid,
        ipfs_status: 'UPLOADED',
        ipfs_provider: attachment.ipfs_provider,
        ipfs_uploaded_at: attachment.ipfs_uploaded_at,
        message: 'Attachment is already uploaded to IPFS.',
      };
    }

    const provider = this.ipfs_service.getProvider();
    const claimed = await this.prisma.attachment.updateMany({
      where: {
        id: attachment.id,
        request_id: id,
        ipfs_cid: null,
        OR: [
          { ipfs_status: null },
          { ipfs_status: 'PENDING' },
          { ipfs_status: 'FAILED' },
        ],
      },
      data: {
        ipfs_status: 'UPLOADING',
        ipfs_provider: provider,
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException(
        'Attachment IPFS upload is already in progress or is not eligible for retry.',
      );
    }

    try {
      const upload = await this.ipfs_service.uploadFile(file.file_path);
      const uploaded_at = new Date();
      const updated_attachment = await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          ipfs_cid: upload.cid,
          ipfs_status: 'UPLOADED',
          ipfs_uploaded_at: uploaded_at,
          ipfs_provider: upload.provider,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'IPFS_UPLOAD_SUCCESS',
        JSON.stringify({
          requestId: id,
          attachmentId: attachment.id,
          hash: attachment.hash,
          cid: upload.cid,
          provider: upload.provider,
          status: 'UPLOADED',
        }),
      );

      return {
        success: true,
        enabled: true,
        uploaded: true,
        already_uploaded: false,
        attachment_id: updated_attachment.id,
        ipfs_cid: updated_attachment.ipfs_cid,
        ipfs_status: updated_attachment.ipfs_status,
        ipfs_provider: updated_attachment.ipfs_provider,
        ipfs_uploaded_at: updated_attachment.ipfs_uploaded_at,
        message: 'Attachment uploaded to IPFS successfully.',
      };
    } catch (error) {
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          ipfs_status: 'FAILED',
          ipfs_provider: provider,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'IPFS_UPLOAD_FAILED',
        JSON.stringify({
          requestId: id,
          attachmentId: attachment.id,
          hash: attachment.hash,
          cid: null,
          provider,
          status: 'FAILED',
        }),
      );

      throw error;
    }
  }

  async anchorAttachmentEvidence(
    id: string,
    attachment_id: string,
    active_user: any,
  ) {
    await this.validateRequestAccess(id, active_user);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found in this request file.');
    }
    if (!attachment.hash) {
      throw new BadRequestException(
        'The attachment does not have a verifiable SHA-256 hash.',
      );
    }
    if (!attachment.ipfs_cid) {
      throw new BadRequestException(
        'The attachment must be uploaded to IPFS before anchoring it on blockchain.',
      );
    }

    if (!this.blockchain_service.isEnabled()) {
      return {
        success: true,
        enabled: false,
        anchored: false,
        blockchain_status: 'DISABLED',
        message: 'Blockchain integration is disabled by configuration.',
      };
    }

    if (
      attachment.blockchain_status === 'ANCHORED' &&
      attachment.blockchain_tx_hash
    ) {
      return {
        success: true,
        enabled: true,
        anchored: false,
        already_anchored: true,
        attachment_id: attachment.id,
        blockchain_status: attachment.blockchain_status,
        blockchain_tx_hash: attachment.blockchain_tx_hash,
        blockchain_anchored_at: attachment.blockchain_anchored_at,
        blockchain_network: attachment.blockchain_network,
        blockchain_contract_address:
          attachment.blockchain_contract_address,
        blockchain_evidence_id: attachment.blockchain_evidence_id,
        message: 'Attachment evidence is already anchored in blockchain.',
      };
    }

    const evidence = {
      requestId: id,
      attachmentId: attachment.id,
      sha256Hash: attachment.hash,
      ipfsCid: attachment.ipfs_cid,
      actor: active_user.id,
    };
    const evidence_id = this.blockchain_service.buildEvidenceId(evidence);
    const network = this.blockchain_service.getNetworkName();
    const claimed = await this.prisma.attachment.updateMany({
      where: {
        id: attachment.id,
        request_id: id,
        blockchain_tx_hash: null,
        OR: [
          { blockchain_status: null },
          { blockchain_status: 'PENDING' },
          { blockchain_status: 'FAILED' },
        ],
      },
      data: {
        blockchain_status: 'ANCHORING',
        blockchain_network: network,
        blockchain_evidence_id: evidence_id,
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException(
        'Attachment blockchain anchoring is already in progress or is not eligible for retry.',
      );
    }

    let anchor_result: Awaited<
      ReturnType<BlockchainService['anchorDocumentEvidence']>
    > | null = null;

    try {
      anchor_result =
        await this.blockchain_service.anchorDocumentEvidence(evidence);
      const anchored_at = new Date();
      const updated_attachment = await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          blockchain_status: 'ANCHORED',
          blockchain_tx_hash: anchor_result.txHash,
          blockchain_anchored_at: anchored_at,
          blockchain_network: anchor_result.network,
          blockchain_contract_address: anchor_result.contractAddress,
          blockchain_evidence_id: anchor_result.evidenceId,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'BLOCKCHAIN_ANCHOR_SUCCESS',
        JSON.stringify({
          requestId: id,
          attachmentId: attachment.id,
          sha256Hash: attachment.hash,
          ipfsCid: attachment.ipfs_cid,
          txHash: anchor_result.txHash,
          evidenceId: anchor_result.evidenceId,
          network: anchor_result.network,
          status: 'ANCHORED',
        }),
      );

      return {
        success: true,
        enabled: true,
        anchored: true,
        already_anchored: false,
        attachment_id: updated_attachment.id,
        blockchain_status: updated_attachment.blockchain_status,
        blockchain_tx_hash: updated_attachment.blockchain_tx_hash,
        blockchain_anchored_at:
          updated_attachment.blockchain_anchored_at,
        blockchain_network: updated_attachment.blockchain_network,
        blockchain_contract_address:
          updated_attachment.blockchain_contract_address,
        blockchain_evidence_id:
          updated_attachment.blockchain_evidence_id,
        block_number: anchor_result.blockNumber,
        message: 'Attachment evidence anchored in blockchain successfully.',
      };
    } catch (error) {
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: {
          blockchain_status: 'FAILED',
          blockchain_tx_hash: anchor_result?.txHash,
          blockchain_anchored_at: anchor_result ? new Date() : undefined,
          blockchain_network: anchor_result?.network ?? network,
          blockchain_contract_address: anchor_result?.contractAddress,
          blockchain_evidence_id: anchor_result?.evidenceId ?? evidence_id,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'BLOCKCHAIN_ANCHOR_FAILED',
        JSON.stringify({
          requestId: id,
          attachmentId: attachment.id,
          sha256Hash: attachment.hash,
          ipfsCid: attachment.ipfs_cid,
          txHash: anchor_result?.txHash ?? null,
          evidenceId: anchor_result?.evidenceId ?? evidence_id,
          network: anchor_result?.network ?? network,
          status: 'FAILED',
        }),
      );

      throw error;
    }
  }

  async deleteAttachment(id: string, attachment_id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user, { allow_delete: true });

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) throw new NotFoundException('Attachment not found in this request file.');

    const { uploads_root, resolved_file_path } =
      this.resolveAttachmentStoragePath(attachment);
    let staged_file_path: string | null = null;

    if (fs.existsSync(resolved_file_path)) {
      const file = this.resolveAttachmentFile(attachment);
      staged_file_path = ensurePathInsideRoot(
        uploads_root,
        `${file.file_path}.delete-${randomUUID()}`,
      );
      try {
        fs.renameSync(file.file_path, staged_file_path);
      } catch {
        throw new InternalServerErrorException(
          'The document could not be prepared for deletion.',
        );
      }
    }

    try {
      await this.prisma.attachment.delete({ where: { id: attachment_id } });
    } catch {
      if (staged_file_path && fs.existsSync(staged_file_path)) {
        try {
          fs.renameSync(staged_file_path, resolved_file_path);
        } catch {
          throw new InternalServerErrorException(
            'The document could not be restored after the database error.',
          );
        }
      }
      throw new InternalServerErrorException(
        'The document record could not be deleted.',
      );
    }

    if (staged_file_path) {
      this.removeDocumentFile(staged_file_path);
    }

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'DELETE_ATTACHMENT',
      `Document "${attachment.name}" deleted from request file ${id}`,
    );

    return { deleted: true, attachment_id };
  }
}
