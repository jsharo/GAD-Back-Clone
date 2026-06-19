import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findRoleByName(name: string) {
    return this.prisma.role.findUnique({ where: { name } });
  }

  async createRole(name: string, description?: string) {
    const existing = await this.findRoleByName(name);
    if (existing) {
      throw new ConflictException(`Role "${name}" already exists.`);
    }

    return this.prisma.role.create({
      data: { name, description },
    });
  }

  async updateRole(id: string, data: { name?: string; description?: string }) {
    return this.prisma.role.update({ where: { id }, data });
  }

  async deleteRole(id: string) {
    const assignedCount = await this.prisma.userRole.count({ where: { roleId: id } });
    if (assignedCount > 0) {
      throw new BadRequestException('Cannot delete a role assigned to users.');
    }

    return this.prisma.role.delete({ where: { id } });
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }

  async createPermission(name: string, description?: string) {
    const existing = await this.prisma.permission.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException(`Permission "${name}" already exists.`);
    }

    return this.prisma.permission.create({ data: { name, description } });
  }

  async updatePermission(id: string, data: { name?: string; description?: string }) {
    return this.prisma.permission.update({ where: { id }, data });
  }

  async deletePermission(id: string) {
    return this.prisma.permission.delete({ where: { id } });
  }

  async assignRole(userId: string, roleName: string, assignedById: string) {
    const role = await this.findRoleByName(roleName);
    if (!role) {
      throw new NotFoundException(`Role "${roleName}" not found.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });

      await tx.userRole.create({
        data: { userId, roleId: role.id },
      });

      await tx.roleAssignment.create({
        data: {
          userId,
          roleId: role.id,
          assignedById,
        },
      });
    });

    return role;
  }

  async getUserRoleName(userId: string): Promise<string | null> {
    const userRole = await this.prisma.userRole.findUnique({
      where: { userId },
      include: { role: true },
    });

    return userRole?.role.name ?? null;
  }

  async getEffectivePermissions(userId: string): Promise<string[]> {
    const [rolePermissions, directPermissions] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: {
          role: {
            users: { some: { userId } },
          },
        },
        include: { permission: true },
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        include: { permission: true },
      }),
    ]);

    const permissionNames = new Set<string>([
      ...rolePermissions.map((entry) => entry.permission.name),
      ...directPermissions.map((entry) => entry.permission.name),
    ]);

    return [...permissionNames].sort();
  }
}
