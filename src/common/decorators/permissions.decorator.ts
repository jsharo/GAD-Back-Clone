import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Require at least one of these effective permissions (OR). ADMINISTRATOR always passes. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
