/**
 * current-user.decorator.ts — @CurrentUser() decorator.
 * Extracts the authenticated user from the request (injected by JwtAuthGuard).
 *
 * Usage: @CurrentUser() user: User
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
