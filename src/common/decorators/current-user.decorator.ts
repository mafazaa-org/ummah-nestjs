import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/** `req.user` is the full, ACTIVE user row attached by AuthGuard (null on guest requests). */
export type AuthenticatedUser = User;

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user: AuthenticatedUser | null | undefined = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
