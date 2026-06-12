/**
 * roles.decorator.ts — Custom @Roles() decorator.
 * Usage: @Roles(Role.SECRETARY, Role.SUPERADMIN)
 */

import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
