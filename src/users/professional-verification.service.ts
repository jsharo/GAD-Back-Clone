import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfessionalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums/role.enum';
import { SubmitProfessionalProfileDto } from './dto/submit-professional-profile.dto';
import { USER_PUBLIC_SELECT } from './constants/user.select';
import { isValidEcuadorianCedula } from '../common/utils/cedula.util';

@Injectable()
export class ProfessionalVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  async submitProfile(userId: string, dto: SubmitProfessionalProfileDto) {
    const role = await this.rolesService.getUserRoleName(userId);
    if (role !== Role.USER) {
      throw new ForbiddenException('Only professionals can submit a professional profile.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, professionalStatus: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.professionalStatus === ProfessionalStatus.VERIFIED) {
      throw new BadRequestException('Professional profile is already verified.');
    }

    if (user.professionalStatus === ProfessionalStatus.PENDING) {
      throw new BadRequestException(
        'Your verification request is already pending secretary review.',
      );
    }

    const cedula = dto.cedula.trim();
    if (!isValidEcuadorianCedula(cedula)) {
      throw new BadRequestException(
        'La cédula no es válida. Debe ser un número de identidad ecuatoriano real.',
      );
    }

    const existingCedula = await this.prisma.user.findFirst({
      where: {
        cedula,
        deletedAt: null,
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (existingCedula) {
      throw new ConflictException('Esta cédula ya está registrada en el sistema.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name.trim(),
        lastname: dto.lastname.trim(),
        cedula,
        senescytCode: dto.senescytCode.trim(),
        professionalStatus: ProfessionalStatus.PENDING,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      userId,
      user.email,
      'SUBMIT_PROFESSIONAL_PROFILE',
      `Professional profile submitted for review: SENESCYT=${dto.senescytCode.trim()}, cedula=${cedula}`,
    );

    return {
      message: 'Profile submitted. Waiting for secretary verification.',
      user: updated,
    };
  }

  async listPending() {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        professionalStatus: ProfessionalStatus.PENDING,
        roleAssignments: { some: { role: { name: Role.USER } } },
      },
      select: USER_PUBLIC_SELECT,
      orderBy: { updatedAt: 'desc' },
    });

    return users;
  }

  async review(
    targetUserId: string,
    approved: boolean,
    actor: { id: string; email: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        deletedAt: null,
        roleAssignments: { some: { role: { name: Role.USER } } },
      },
      select: {
        id: true,
        email: true,
        professionalStatus: true,
        name: true,
        lastname: true,
        senescytCode: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Professional user not found.');
    }

    if (user.professionalStatus !== ProfessionalStatus.PENDING) {
      throw new BadRequestException(
        'This user has no pending professional verification request.',
      );
    }

    const nextStatus = approved
      ? ProfessionalStatus.VERIFIED
      : ProfessionalStatus.REJECTED;

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { professionalStatus: nextStatus },
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      actor.id,
      actor.email,
      approved ? 'APPROVE_PROFESSIONAL' : 'REJECT_PROFESSIONAL',
      `Professional ${user.email} set to ${nextStatus} (SENESCYT: ${user.senescytCode ?? 'n/a'})`,
    );

    return {
      message: approved
        ? 'Professional verified. They can now create procedures.'
        : 'Professional verification rejected.',
      user: updated,
    };
  }

  async assertCanCreateProcedures(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { professionalStatus: true },
    });

    if (!user || user.professionalStatus !== ProfessionalStatus.VERIFIED) {
      throw new ForbiddenException(
        'Your professional account is not verified yet. Complete your profile and wait for secretary approval.',
      );
    }
  }
}
