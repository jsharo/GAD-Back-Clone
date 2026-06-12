import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInstitutionalUserDto } from './dto/create-institutional-user.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { PropertyZone, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit_service: AuditService,
  ) {}

  async createInstitutional(dto: CreateInstitutionalUserDto, admin_user: any) {
    const existing_email = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing_email) {
      throw new ConflictException('Email is already registered');
    }

    const existing_national_id = await this.prisma.user.findUnique({
      where: { national_id: dto.national_id },
    });
    if (existing_national_id) {
      throw new ConflictException('National ID is already registered');
    }

    const hashed_password = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash: hashed_password,
        first_name: dto.first_name,
        last_name: dto.last_name,
        national_id: dto.national_id,
        phone: dto.phone || null,
        role: dto.role,
        active: true,
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        national_id: true,
        phone: true,
        role: true,
        zone: true,
        active: true,
        created_at: true,
      },
    });

    await this.audit_service.logAction(
      admin_user.id,
      admin_user.email,
      'CREATE_USER_INSTITUTIONAL',
      `Institutional user created: ${user.email} with role ${user.role}`,
    );

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        national_id: true,
        phone: true,
        role: true,
        zone: true,
        active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findTechnicians() {
    return this.prisma.user.findMany({
      where: { role: Role.TECHNICIAN, active: true },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        national_id: true,
        phone: true,
        role: true,
        zone: true,
        active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getDashboardStats() {
    const [total, technicians, citizens] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.TECHNICIAN } }),
      this.prisma.user.count({ where: { role: Role.CITIZEN } }),
    ]);

    const requests_by_status = await this.prisma.request.groupBy({
      by: ['status'],
      _count: true,
    });

    const requests = {
      DRAFT: 0,
      PENDING_SECRETARY: 0,
      OBSERVED: 0,
      PENDING_TECHNICIAN: 0,
      INSPECTION: 0,
      PENDING_PAYMENT: 0,
      PAID: 0,
      APPROVED: 0,
      REJECTED: 0,
    };

    for (const group of requests_by_status) {
      if (group.status in requests) {
        requests[group.status as keyof typeof requests] = group._count;
      }
    }

    return {
      users: {
        total,
        technicians,
        citizens,
      },
      requests,
    };
  }

  async updateZone(id: string, update_zone_dto: UpdateZoneDto, admin_user: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated_user = await this.prisma.user.update({
      where: { id },
      data: {
        zone: update_zone_dto.zone as PropertyZone,
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        zone: true,
        active: true,
      },
    });

    await this.audit_service.logAction(
      admin_user.id,
      admin_user.email,
      'UPDATE_ZONE',
      `Zone of technician ${user.email} updated to ${update_zone_dto.zone}`,
    );

    return updated_user;
  }

  async toggleActive(id: string, toggle_active_dto: ToggleActiveDto, admin_user: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated_user = await this.prisma.user.update({
      where: { id },
      data: {
        active: toggle_active_dto.active,
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        active: true,
      },
    });

    await this.audit_service.logAction(
      admin_user.id,
      admin_user.email,
      'TOGGLE_ACTIVE',
      `Activation status of user ${user.email} changed to ${toggle_active_dto.active}`,
    );

    return updated_user;
  }
}
