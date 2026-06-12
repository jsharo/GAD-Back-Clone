import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { InspectionReportDto } from './dto/inspection-report.dto';
import { ResolveRequestDto } from './dto/resolve-request.dto';
import { RequestStatus } from '../common/enums/request-status.enum';
import { PropertyZone } from '@prisma/client';

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit_service: AuditService,
  ) {}

  async create(create_dto: CreateRequestDto, citizen_id: string, citizen_email: string) {
    // 1. Create Property
    const property = await this.prisma.property.create({
      data: {
        cadastral_key: create_dto.property.cadastral_key || null,
        address: create_dto.property.address,
        area: create_dto.property.area || null,
        zone: create_dto.property.zone as PropertyZone,
      },
    });

    // 2. Create Request
    const request = await this.prisma.request.create({
      data: {
        request_type: create_dto.request_type,
        status: RequestStatus.PENDING_SECRETARY,
        citizen_id,
        property_id: property.id,
      },
    });

    // 3. Create first RequestHistory entry
    await this.prisma.requestHistory.create({
      data: {
        previous_status: 'NONE',
        new_status: RequestStatus.PENDING_SECRETARY,
        comment: 'Request submitted successfully',
        responsible: citizen_email,
        request_id: request.id,
      },
    });

    // 4. Log Audit action
    await this.audit_service.logAction(
      citizen_id,
      citizen_email,
      'CREATE_REQUEST',
      `Request created for property at ${property.address} with type ${request.request_type}`,
    );

    return request;
  }

  async findAll(status?: string) {
    const query_options: any = {
      include: {
        citizen: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
          },
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
      include: {
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
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            phone: true,
          },
        },
        architect: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
          },
        },
        property: true,
        attachments: true,
        history: { orderBy: { created_at: 'desc' } },
        inspection: true,
        resolution: true,
        secretary_decision: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return request;
  }

  async updateStatus(id: string, update_dto: UpdateStatusDto, active_user: any) {
    const request = await this.prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: { status: update_dto.status },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: update_dto.status,
        comment: update_dto.comment || 'Status updated',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPDATE_REQUEST_STATUS',
      `Request status updated from ${request.status} to ${update_dto.status}`,
    );

    return updated;
  }

  async scheduleInspection(id: string, schedule_dto: ScheduleInspectionDto, active_user: any) {
    const request = await this.prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    // Upsert inspection in case one already exists for this request
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
        comment: schedule_dto.comments || `Inspection scheduled for technician ${schedule_dto.technician}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'SCHEDULE_INSPECTION',
      `Inspection scheduled for request ${id} with technician ${schedule_dto.technician}`,
    );

    return { id, status: RequestStatus.INSPECTION };
  }

  async uploadInspectionReport(id: string, report_dto: InspectionReportDto, photos: Express.Multer.File[], active_user: any) {
    const request = await this.prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const inspection = await this.prisma.inspection.findUnique({
      where: { request_id: id },
    });

    if (!inspection) {
      throw new NotFoundException('Inspection is not scheduled for this request');
    }

    const photo_urls: string[] = [];
    if (photos && photos.length > 0) {
      const upload_dir = './uploads';
      if (!fs.existsSync(upload_dir)) {
        fs.mkdirSync(upload_dir, { recursive: true });
      }
      for (const file of photos) {
        const file_name = `${Date.now()}-${file.originalname}`;
        const file_path = path.join(upload_dir, file_name);
        fs.writeFileSync(file_path, file.buffer);
        photo_urls.push(`/uploads/${file_name}`);
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
        comment: 'Technical inspection report uploaded with photo attachments',
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'UPLOAD_INSPECTION_REPORT',
      `Inspection report uploaded for request ${id} by ${active_user.email}`,
    );

    return { id, status: request.status };
  }

  async resolve(id: string, resolve_dto: ResolveRequestDto, active_user: any) {
    const request = await this.prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const target_state = resolve_dto.payment_amount
      ? RequestStatus.PENDING_PAYMENT
      : (resolve_dto.approved ? RequestStatus.APPROVED : RequestStatus.REJECTED);

    // Upsert resolution
    await this.prisma.resolution.upsert({
      where: { request_id: id },
      create: {
        comments: resolve_dto.comments,
        payment_amount: resolve_dto.payment_amount || null,
        items: resolve_dto.payment_amount ? ['Favorable technical fee'] : [],
        request_id: id,
      },
      update: {
        comments: resolve_dto.comments,
        payment_amount: resolve_dto.payment_amount || null,
        items: resolve_dto.payment_amount ? ['Favorable technical fee'] : [],
      },
    });

    await this.prisma.request.update({
      where: { id },
      data: { status: target_state },
    });

    await this.prisma.requestHistory.create({
      data: {
        previous_status: request.status,
        new_status: target_state,
        comment: resolve_dto.comments || `Request resolved to status ${target_state}`,
        responsible: active_user.email,
        request_id: id,
      },
    });

    await this.audit_service.logAction(
      active_user.id,
      active_user.email,
      'RESOLVE_REQUEST',
      `Request resolved to ${target_state} with comments: ${resolve_dto.comments}`,
    );

    return { id, status: target_state };
  }
}
