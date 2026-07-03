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
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
    });
  }

  async findRoleById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role "${id}" not found.`);
    }

    return role;
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

  async syncRolePermissions(roleId: string, permissionIds: string[]) {
    await this.findRoleById(roleId);

    const uniquePermissionIds = [...new Set(permissionIds)];

    if (uniquePermissionIds.length > 0) {
      const permissions = await this.prisma.permission.findMany({
        where: { id: { in: uniquePermissionIds } },
        select: { id: true },
      });

      if (permissions.length !== uniquePermissionIds.length) {
        throw new BadRequestException('One or more permissions were not found.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });

      if (uniquePermissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: uniquePermissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }
    });

    return this.findRoleById(roleId);
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

    await this.removeDirectPermissionsCoveredByRole(userId);

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

  async getUserDirectPermissionIds(userId: string): Promise<string[]> {
    await this.ensureUserExists(userId);

    const entries = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { permissionId: true },
      orderBy: { permissionId: 'asc' },
    });

    return entries.map((entry) => entry.permissionId);
  }

  async getUserPermissionBreakdown(userId: string) {
    await this.ensureUserExists(userId);

    const [roleName, rolePermissionIds, storedDirectIds] = await Promise.all([
      this.getUserRoleName(userId),
      this.getRolePermissionIdsForUser(userId),
      this.getUserDirectPermissionIds(userId),
    ]);

    const roleSet = new Set(rolePermissionIds);
    const directPermissionIds = storedDirectIds.filter((id) => !roleSet.has(id));
    const effectivePermissionIds = [...new Set([...rolePermissionIds, ...directPermissionIds])].sort();

    return {
      roleName,
      rolePermissionIds,
      directPermissionIds,
      effectivePermissionIds,
    };
  }

  async syncUserPermissions(userId: string, permissionIds: string[]) {
    await this.ensureUserExists(userId);

    const rolePermissionIds = await this.getRolePermissionIdsForUser(userId);
    const roleSet = new Set(rolePermissionIds);
    const uniqueRequested = [...new Set(permissionIds)];
    const ignoredBecauseInRole = uniqueRequested.filter((id) => roleSet.has(id));
    const directOnly = uniqueRequested.filter((id) => !roleSet.has(id));

    if (directOnly.length > 0) {
      const permissions = await this.prisma.permission.findMany({
        where: { id: { in: directOnly } },
        select: { id: true },
      });

      if (permissions.length !== directOnly.length) {
        throw new BadRequestException('One or more permissions were not found.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });

      if (directOnly.length > 0) {
        await tx.userPermission.createMany({
          data: directOnly.map((permissionId) => ({
            userId,
            permissionId,
          })),
        });
      }
    });

    return {
      directPermissionIds: await this.getUserDirectPermissionIds(userId),
      ignoredBecauseInRole,
    };
  }

  private async getRolePermissionIdsForUser(userId: string): Promise<string[]> {
    const entries = await this.prisma.rolePermission.findMany({
      where: {
        role: {
          users: { some: { userId } },
        },
      },
      select: { permissionId: true },
    });

    return entries.map((entry) => entry.permissionId);
  }

  private async removeDirectPermissionsCoveredByRole(userId: string) {
    const rolePermissionIds = await this.getRolePermissionIdsForUser(userId);
    if (rolePermissionIds.length === 0) return;

    await this.prisma.userPermission.deleteMany({
      where: {
        userId,
        permissionId: { in: rolePermissionIds },
      },
    });
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User "${userId}" not found.`);
    }
  }
}
