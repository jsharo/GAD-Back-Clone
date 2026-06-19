import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  ForbiddenException,
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

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit_service: AuditService,
    private readonly fee_rules_service: FeeRulesService,
  ) {}

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

  async findOne(id: string) {
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

    // ── Guardia de firma ───────────────────────────────────────────────────
    // La firma del PDF del profesional DEBE ser validada antes de aprobar.
    if (review_dto.approved && !review_dto.signature_validated) {
      throw new UnprocessableEntityException(
        'No se puede aprobar el expediente sin validar previamente la firma digital del profesional en el PDF adjunto. ' +
        'Por favor, verifique la firma y reintente con signature_validated = true.',
      );
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
        `Firma validada y expediente aprobado por la secretaría. ` +
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

  /** Sube un documento al expediente, clasificándolo en la carpeta indicada. */
  async uploadAttachment(
    id: string,
    dto: UploadAttachmentDto,
    file: Express.Multer.File,
    active_user: any,
  ) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    if (!file) throw new BadRequestException('Se requiere un archivo para adjuntar.');

    // Guardar archivo físico
    const folder_path = path.join('./uploads', 'expedientes', id, dto.folder);
    if (!fs.existsSync(folder_path)) fs.mkdirSync(folder_path, { recursive: true });

    const safe_name = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    const file_path = path.join(folder_path, safe_name);
    fs.writeFileSync(file_path, file.buffer);

    const url = `/uploads/expedientes/${id}/${dto.folder}/${safe_name}`;

    // Crear registro en BD
    const attachment = await this.prisma.attachment.create({
      data: {
        name: dto.name || file.originalname,
        type: file.mimetype,
        url,
        size: file.size,
        folder: dto.folder,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_ATTACHMENT',
      `Documento "${attachment.name}" cargado en carpeta ${dto.folder} del expediente ${id}`,
    );

    return attachment;
  }

  /** Lista los adjuntos de un expediente, con filtro opcional por carpeta. */
  async listAttachments(id: string, folder?: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    const where: any = { request_id: id };
    if (folder) where.folder = folder;

    return this.prisma.attachment.findMany({
      where,
      orderBy: [{ folder: 'asc' }, { created_at: 'asc' }],
    });
  }

  /** Elimina un adjunto del expediente (archivo físico + registro en BD). */
  async deleteAttachment(id: string, attachment_id: string, active_user: any) {
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
