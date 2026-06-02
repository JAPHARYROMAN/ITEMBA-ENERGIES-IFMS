import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayloadUser } from "../decorators/current-user.decorator";
import { AuthService } from "../auth.service";
import {
  getCachedPermission,
  setCachedPermission,
  invalidatePermissionCache,
} from "./permission-cache";

// Re-exported for backward compatibility with existing importers.
export { invalidatePermissionCache };

export interface JwtPayload {
  sub: string;
  email: string;
  type: "access";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayloadUser> {
    if (payload.type !== "access")
      throw new UnauthorizedException("Invalid token type");

    const cached = getCachedPermission(payload.sub);
    if (cached) {
      return cached;
    }

    const userWithPerms = await this.authService.getUserWithPermissions(
      payload.sub,
    );
    if (!userWithPerms) throw new UnauthorizedException("User not found");

    const result: JwtPayloadUser = {
      sub: userWithPerms.id,
      email: userWithPerms.email,
      permissions: userWithPerms.permissions,
    };

    setCachedPermission(payload.sub, result);

    return result;
  }
}
