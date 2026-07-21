/**
 * role.enum.ts — Application role names (must match `role` table seeds).
 */

export enum Role {
  ADMINISTRATOR = 'ADMINISTRATOR',
  SECRETARY = 'SECRETARY',
  TECHNICIAN = 'TECHNICIAN',
  USER = 'USER',
  CITIZEN = 'CITIZEN',
  FINANCIAL = 'FINANCIAL',
}

/** Roles currently allowed for institutional assignment in the product. */
export const ASSIGNABLE_ROLES: Role[] = [
  Role.ADMINISTRATOR,
  Role.SECRETARY,
  Role.TECHNICIAN,
  Role.USER,
];

export function IsAssignableRole(roleName: string): boolean {
  return (ASSIGNABLE_ROLES as string[]).includes(roleName);
}
