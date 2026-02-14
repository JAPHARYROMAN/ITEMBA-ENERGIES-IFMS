import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayloadUser {
  sub: string;
  email: string;
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayloadUser | undefined, ctx: ExecutionContext): JwtPayloadUser | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser;
    return data ? user?.[data] : user;
  },
);
