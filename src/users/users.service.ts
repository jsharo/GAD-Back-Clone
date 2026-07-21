import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RolesService } from '../roles/roles.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { Role } from '../common/enums/role.enum';
import { USER_PUBLIC_SELECT } from './constants/user.select';
import { isValidEcuadorianCedula } from '../common/utils/cedula.util';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
  ) {}

  async presentUser<T extends { id: string }>(user: T) {
    const role = await this.rolesService.getUserRoleName(user.id);
    return { ...user, role };
  }

  async findAllForAdmin(roleName?: string, limit = 100) {
    const where: {
      deletedAt: null;
      roleAssignments?: { some: { role: { name: string } } };
    } = { deletedAt: null };

    if (roleName) {
      where.roleAssignments = {
        some: { role: { name: roleName } },
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return Promise.all(users.map((user) => this.presentUser(user)));
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        password: true,
        status: true,
        emailVerified: true,
        name: true,
        lastname: true,
        cedula: true,
        senescytCode: true,
        professionalStatus: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is inactive');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByRole(roleName: string) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        roleAssignments: {
          some: { role: { name: roleName } },
        },
      },
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDashboardStats() {
    const activeTechnicianFilter = {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      roleAssignments: {
        some: { role: { name: Role.TECHNICIAN } },
      },
    } as const;

    const [totalUsers, activeTechnicians] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: activeTechnicianFilter }),
    ]);

    return { totalUsers, activeTechnicians };
  }

  private async assertUniqueEmail(email: string) {
    const existingEmail = await this.prisma.user.findUnique({ where: { email } });

    if (existingEmail && !existingEmail.deletedAt) {
      throw new ConflictException('Email is already registered');
    }
  }

  private async assertUniqueCedula(cedula: string, excludeUserId?: string) {
    const existingCedula = await this.prisma.user.findUnique({ where: { cedula } });

    if (
      existingCedula &&
      !existingCedula.deletedAt &&
      existingCedula.id !== excludeUserId
    ) {
      throw new ConflictException('National ID is already registered');
    }
  }

  /** Solo persiste el usuario en base de datos. */
  async create(dto: CreateUserDto) {
    await this.assertUniqueEmail(dto.email);

    if (dto.cedula) {
      await this.assertUniqueCedula(dto.cedula);
    }

    const hashedPassword = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        cedula: dto.cedula ?? null,
        name: dto.name ?? null,
        lastname: dto.lastname ?? null,
        direction: dto.direction ?? null,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateOwnProfileDto,
    actor: { id: string; email: string },
  ) {
    const existing = await this.findById(userId);
    const role = await this.rolesService.getUserRoleName(userId);

    if (role === Role.USER) {
      if (existing.professionalStatus !== 'VERIFIED') {
        throw new ForbiddenException(
          'Solo puedes editar tu perfil después de que Secretaría apruebe tu habilitación profesional.',
        );
      }
    }

    if (dto.cedula) {
      const cedula = dto.cedula.trim();
      if (!isValidEcuadorianCedula(cedula)) {
        throw new BadRequestException(
          'La cédula no es válida. Debe ser un número de identidad ecuatoriano real.',
        );
      }
      await this.assertUniqueCedula(cedula, userId);
    }

    const data: { name?: string; lastname?: string; cedula?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.lastname !== undefined) data.lastname = dto.lastname.trim();
    if (dto.cedula !== undefined) data.cedula = dto.cedula.trim();

    if (Object.keys(data).length === 0) {
      const user = await this.findById(userId);
      return this.presentUser(user);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      actor.id,
      actor.email,
      'UPDATE_OWN_PROFILE',
      `User ${user.email} updated own profile`,
    );

    return this.presentUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: { id: string; email: string }) {
    await this.findById(id);

    if (dto.cedula) {
      await this.assertUniqueCedula(dto.cedula, id);
    }

    const { password, ...profileFields } = dto;
    const data: {
      name?: string;
      lastname?: string;
      direction?: string;
      cedula?: string;
      password?: string;
    } = { ...profileFields };

    if (password) {
      data.password = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      actor.id,
      actor.email,
      'UPDATE_USER',
      `User ${user.email} updated`,
    );

    return this.presentUser(user);
  }

  async setStatus(
    id: string,
    status: UserStatus,
    actor: { id: string; email: string },
  ) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      actor.id,
      actor.email,
      'UPDATE_USER_STATUS',
      `User ${user.email} status changed to ${status}`,
    );

    return this.presentUser(user);
  }

  /** Hard delete for failed registration rollback (frees email/cedula). */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async softDelete(id: string, actor: { id: string; email: string }) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: UserStatus.INACTIVE,
      },
      select: USER_PUBLIC_SELECT,
    });

    await this.auditService.logAction(
      actor.id,
      actor.email,
      'SOFT_DELETE_USER',
      `User ${user.email} soft deleted`,
    );

    return user;
  }
}
