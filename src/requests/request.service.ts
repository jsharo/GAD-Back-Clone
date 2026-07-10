import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit_service: AuditService,
    private readonly fee_rules_service: FeeRulesService,
    private readonly ipfs_service: IpfsService,
    private readonly blockchain_service: BlockchainService,
  ) {}

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
      throw new NotFoundException('Solicitud no encontrada.');
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
          'No tiene permisos para eliminar documentos de este expediente.',
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
        'No tiene permisos para acceder a este expediente.',
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
        'Para solicitar una Aprobación de Planos, el ciudadano debe contar con una ' +
        'Línea de Fábricas APROBADA previamente. ' +
        'Por favor, tramite primero la Línea de Fábricas.',
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
      if (!create_dto.citizen_id) {
        throw new BadRequestException(
          'El profesional habilitado debe especificar el "citizen_id" del propietario del predio.',
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
          `No se encontró ningún ciudadano con id: ${create_dto.citizen_id}`,
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
      ? `Profesional: ${active_user.email} en nombre del ciudadano`
      : active_user.email;

    await this.prisma.requestHistory.create({
      data: {
        previous_status: 'NONE',
        new_status: RequestStatus.PENDING_SECRETARY,
        comment: architect_id
          ? `Expediente ingresado por profesional habilitado (${active_user.email}) a nombre del propietario.`
          : 'Solicitud registrada por el ciudadano.',
        responsible: responsible_label,
        request_id: request.id,
      },
    });

    // 4. Auditoría
    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'CREATE_REQUEST',
      `Solicitud creada para el predio en ${property.address} — tipo: ${request.request_type}` +
      (architect_id ? ` — por profesional habilitado` : ''),
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
          select: { id: true, email: true, name: true, lastname: true },
        },
        architect: {
          select: { id: true, email: true, name: true, lastname: true },
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
      throw new NotFoundException('Solicitud no encontrada.');
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
      throw new NotFoundException('Solicitud no encontrada.');
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
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    const updated = await this.prisma.request.update({
      where: { id },
      data: { status: update_dto.status },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: update_dto.status,
        comment: update_dto.comment || 'Estado actualizado manualmente.',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPDATE_REQUEST_STATUS',
      `Estado actualizado: ${request.status} → ${update_dto.status}`,
    );

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECRETARY REVIEW — Validación de firma + decisión de avance
  // ──────────────────────────────────────────────────────────────────────────
  async secretaryReview(id: string, review_dto: SecretaryReviewDto, active_user: any) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    // Solo se puede revisar si el expediente está en PENDING_SECRETARY u OBSERVED
    const reviewable_states = [RequestStatus.PENDING_SECRETARY, RequestStatus.OBSERVED];
    if (!reviewable_states.includes(request.status as RequestStatus)) {
      throw new BadRequestException(
        `El expediente está en estado "${request.status}" y no puede ser revisado por la secretaría en este momento.`,
      );
    }

    // ── Alerta de firma (NO bloqueante) ─────────────────────────────────────
    // Si la firma no fue validada, se registra una alerta informativa
    // pero el flujo continúa normalmente.
    if (review_dto.approved && !review_dto.signature_validated) {
      await this.prisma.requestHistory.create({
        data: {
          previous_status: request.status,
          new_status: request.status,
          comment:
            'ALERTA: La secretaria aprobó el expediente SIN validar la firma digital del profesional. ' +
            'Se recomienda verificar la autenticidad del documento.',
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
        `Expediente observado por la secretaría. ` +
        (review_dto.remarks ? `Motivo: ${review_dto.remarks}` : 'Sin observaciones adicionales.');
    } else {
      new_status = RequestStatus.PENDING_TECHNICIAN;
      history_comment =
        (review_dto.signature_validated
          ? `Firma validada y expediente aprobado por la secretaría. `
          : `Expediente aprobado por la secretaría con firma no validada; se registró alerta informativa. `) +
        `Se remite a revisión técnica. ` +
        (review_dto.remarks ? review_dto.remarks : '');
    }

    // ── Persistir decisión de la secretaría ───────────────────────────────
    await this.prisma.secretaryDecision.upsert({
      where: { request_id: id },
      create: {
        approved: review_dto.approved,
        remarks: review_dto.remarks || null,
        signature_validated: review_dto.signature_validated,
        request_id: id,
        secretary_id: active_user.id,
      },
      update: {
        approved: review_dto.approved,
        remarks: review_dto.remarks || null,
        signature_validated: review_dto.signature_validated,
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
      `Revisión de secretaría: aprobado=${review_dto.approved}, firma_validada=${review_dto.signature_validated}, nuevo estado=${new_status}`,
    );

    return {
      id,
      status: new_status,
      signature_validated: review_dto.signature_validated,
      approved: review_dto.approved,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCHEDULE INSPECTION
  // ──────────────────────────────────────────────────────────────────────────
  async scheduleInspection(id: string, schedule_dto: ScheduleInspectionDto, active_user: any) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

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
          `Visita técnica programada para el inspector: ${schedule_dto.technician}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'SCHEDULE_INSPECTION',
      `Inspección agendada para el expediente ${id} — inspector: ${schedule_dto.technician}`,
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
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    const inspection = await this.prisma.inspection.findUnique({ where: { request_id: id } });
    if (!inspection) {
      throw new NotFoundException('No hay inspección agendada para esta solicitud.');
    }

    const photo_urls: string[] = [];
    if (photos && photos.length > 0) {
      const upload_dir = './uploads/inspections';
      if (!fs.existsSync(upload_dir)) fs.mkdirSync(upload_dir, { recursive: true });
      for (const file of photos) {
        const hash = createHash('sha256').update(file.buffer).digest('hex');
        const file_name = `${Date.now()}-${path.basename(file.originalname)}`;
        const file_path = path.join(upload_dir, file_name);
        const file_url = `/uploads/inspections/${file_name}`;
        fs.writeFileSync(file_path, file.buffer);
        photo_urls.push(file_url);

        await this.prisma.attachment.create({
          data: {
            name: file.originalname,
            type: file.mimetype,
            url: file_url,
            size: file.size,
            hash,
            folder: 'INFORMES',
            request_id: id,
          },
        });

        await this.audit_service.logAction(
          active_user.id,
          active_user.email,
          'UPLOAD_INSPECTION_FILE',
          `Inspection file uploaded for request ${id}: ${file.originalname}, sha256=${hash}`,
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
        comment: 'Informe técnico de inspección cargado con evidencia fotográfica.',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_INSPECTION_REPORT',
      `Informe de inspección cargado para la solicitud ${id}`,
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
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

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
          ? `Resolución favorable — monto calculado automáticamente: $${payment_amount}. ${resolve_dto.comments}`
          : `Solicitud rechazada: ${resolve_dto.comments}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'RESOLVE_REQUEST',
      `Solicitud resuelta → ${target_state}. Monto: $${payment_amount ?? 'N/A'}`,
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

    if (!file) throw new BadRequestException('Se requiere un archivo para adjuntar.');

    const hash = createHash('sha256').update(file.buffer).digest('hex');

    // ── Detección de cambio de hash (NO bloqueante) ─────────────────────────
    const doc_name = dto.name || file.originalname;
    const previous_attachment = await this.prisma.attachment.findFirst({
      where: {
        request_id: id,
        folder: dto.folder,
        name: doc_name,
      },
      orderBy: { created_at: 'desc' },
    });

    if (
      previous_attachment?.hash &&
      previous_attachment.hash !== hash
    ) {
      // Registrar alerta en el historial del trámite
      await this.prisma.requestHistory.create({
        data: {
          previous_status: access_context.status,
          new_status: access_context.status,
          comment:
            `ALERTA DE INTEGRIDAD: El documento "${doc_name}" en carpeta ${dto.folder} ` +
            `fue reemplazado y su hash SHA-256 cambió. ` +
            `Hash anterior: ${previous_attachment.hash.substring(0, 16)}... → ` +
            `Hash nuevo: ${hash.substring(0, 16)}... ` +
            `Subido por: ${active_user.email}`,
          responsible: 'SISTEMA',
          request_id: id,
        },
      });

      await this.audit_service.logAction(
        active_user.id,
        active_user.email,
        'HASH_CHANGE_ALERT',
        `Hash de firma cambió en doc "${doc_name}" del expediente ${id}. ` +
        `Anterior: ${previous_attachment.hash.substring(0, 16)}... → Nuevo: ${hash.substring(0, 16)}...`,
      );
    }

    // Guardar archivo físico
    const folder_path = path.join('./uploads', 'expedientes', id, dto.folder);
    if (!fs.existsSync(folder_path)) fs.mkdirSync(folder_path, { recursive: true });

    const safe_name = `${Date.now()}-${path.basename(file.originalname).replace(/\s+/g, '_')}`;
    const file_path = path.join(folder_path, safe_name);
    fs.writeFileSync(file_path, file.buffer);

    const url = `/uploads/expedientes/${id}/${dto.folder}/${safe_name}`;

    // Crear registro en BD
    const attachment = await this.prisma.attachment.create({
      data: {
        name: doc_name,
        type: file.mimetype,
        url,
        size: file.size,
        hash,
        folder: dto.folder,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_ATTACHMENT',
      `Documento "${attachment.name}" cargado en carpeta ${dto.folder} del expediente ${id}, sha256=${hash.substring(0, 16)}...`,
    );

    return attachment;
  }

  /** Lista los adjuntos de un expediente, con filtro opcional por carpeta. */
  async listAttachments(id: string, folder: string | undefined, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const where: any = { request_id: id };
    if (folder) where.folder = folder;

    return this.prisma.attachment.findMany({
      where,
      orderBy: [{ folder: 'asc' }, { created_at: 'asc' }],
    });
  }

  /** Resuelve un adjunto autorizado a una ruta física segura para su entrega. */
  private resolveAttachmentFile(attachment: any) {
    const uploads_root = path.resolve(process.cwd(), 'uploads');
    const relative_url = attachment.url.replace(/^[/\\]+/, '');
    const resolved_file_path = path.resolve(process.cwd(), relative_url);
    const relative_path = path.relative(uploads_root, resolved_file_path);

    if (relative_path.startsWith('..') || path.isAbsolute(relative_path)) {
      throw new ForbiddenException('La ruta del documento no es valida.');
    }

    if (!fs.existsSync(resolved_file_path)) {
      throw new NotFoundException('El archivo fisico no existe.');
    }

    let real_uploads_root: string;
    let real_file_path: string;
    try {
      real_uploads_root = fs.realpathSync(uploads_root);
      real_file_path = fs.realpathSync(resolved_file_path);
    } catch {
      throw new NotFoundException('El archivo fisico no existe.');
    }

    const real_relative_path = path.relative(real_uploads_root, real_file_path);
    if (
      real_relative_path.startsWith('..') ||
      path.isAbsolute(real_relative_path)
    ) {
      throw new ForbiddenException('La ruta del documento no es valida.');
    }

    const file_stats = fs.statSync(real_file_path);
    if (!file_stats.isFile()) {
      throw new NotFoundException('El archivo fisico no existe.');
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
      throw new NotFoundException('Adjunto no encontrado en este expediente.');
    }

    const uploads_root = path.resolve(process.cwd(), 'uploads');
    const relative_url = attachment.url.replace(/^[/\\]+/, '');
    const resolved_file_path = path.resolve(process.cwd(), relative_url);
    const relative_path = path.relative(uploads_root, resolved_file_path);

    if (relative_path.startsWith('..') || path.isAbsolute(relative_path)) {
      throw new ForbiddenException('La ruta del documento no es válida.');
    }

    if (!fs.existsSync(resolved_file_path)) {
      throw new NotFoundException('El archivo físico no existe.');
    }

    let real_uploads_root: string;
    let real_file_path: string;
    try {
      real_uploads_root = fs.realpathSync(uploads_root);
      real_file_path = fs.realpathSync(resolved_file_path);
    } catch {
      throw new NotFoundException('El archivo físico no existe.');
    }

    const real_relative_path = path.relative(real_uploads_root, real_file_path);
    if (
      real_relative_path.startsWith('..') ||
      path.isAbsolute(real_relative_path)
    ) {
      throw new ForbiddenException('La ruta del documento no es válida.');
    }

    const file_stats = fs.statSync(real_file_path);
    if (!file_stats.isFile()) {
      throw new NotFoundException('El archivo físico no existe.');
    }

    return {
      attachment,
      file_path: real_file_path,
      file_size: file_stats.size,
    };
  }

  /** Elimina un adjunto del expediente (archivo físico + registro en BD). */
  async verifyAttachmentIntegrity(id: string, attachment_id: string, active_user: any) {
    await this.validateRequestAccess(id, active_user);

    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachment_id, request_id: id },
    });
    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado en este expediente.');
    }

    const file = this.resolveAttachmentFile(attachment);
    const current_hash = createHash('sha256')
      .update(fs.readFileSync(file.file_path))
      .digest('hex');

    if (!attachment.hash) {
      return {
        success: true,
        valid: false,
        verifiable: false,
        attachment_id: attachment.id,
        stored_hash: null,
        current_hash,
        message: 'Attachment does not have a stored hash.',
      };
    }

    const valid = attachment.hash === current_hash;

    return {
      success: true,
      valid,
      verifiable: true,
      attachment_id: attachment.id,
      stored_hash: attachment.hash,
      current_hash,
      message: valid
        ? 'Attachment integrity is valid.'
        : 'Attachment integrity violation detected.',
    };
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
      throw new NotFoundException('Adjunto no encontrado en este expediente.');
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
      throw new NotFoundException('Adjunto no encontrado en este expediente.');
    }
    if (!attachment.hash) {
      throw new BadRequestException(
        'El adjunto no tiene un hash SHA-256 verificable.',
      );
    }
    if (!attachment.ipfs_cid) {
      throw new BadRequestException(
        'El adjunto debe subirse a IPFS antes de anclarlo en blockchain.',
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
    if (!attachment) throw new NotFoundException('Adjunto no encontrado en este expediente.');

    // Eliminar archivo físico si existe
    const local_path = path.join('.', attachment.url);
    if (fs.existsSync(local_path)) {
      fs.unlinkSync(local_path);
    }

    await this.prisma.attachment.delete({ where: { id: attachment_id } });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'DELETE_ATTACHMENT',
      `Documento "${attachment.name}" eliminado del expediente ${id}`,
    );

    return { deleted: true, attachment_id };
  }
}
