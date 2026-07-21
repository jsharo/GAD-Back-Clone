import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../common/enums/role.enum';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { RolesService } from '../../roles/roles.service';

/**
 * Access control: ADMINISTRATOR always allowed.
 * If @Roles and/or @RequirePermissions are set, the user passes when
 * they match ANY required role OR hold ANY required effective permission.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasRoleReqs = Boolean(requiredRoles?.length);
    const hasPermReqs = Boolean(requiredPermissions?.length);

    if (!hasRoleReqs && !hasPermReqs) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    if (user.role === Role.ADMINISTRATOR) {
      return true;
    }

    if (hasRoleReqs && requiredRoles!.some((role) => user.role === role)) {
      return true;
    }

    if (hasPermReqs && user.id) {
      const effective = await this.rolesService.getEffectivePermissions(user.id);
      if (requiredPermissions!.some((p) => effective.includes(p))) {
        return true;
      }
    }

    throw new ForbiddenException(
      'You do not have sufficient permissions to perform this action',
    );
  }
}
