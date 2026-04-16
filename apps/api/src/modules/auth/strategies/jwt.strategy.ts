import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayloadUser } from "../decorators/current-user.decorator";
import { AuthService } from "../auth.service";

export interface JwtPayload {
  sub: string;
  email: string;
  type: "access";
}

/**
 * In-memory TTL cache for user permissions to avoid 3+ DB queries per request.
 * Entries expire after TTL_MS. Keyed by userId.
 */
interface CachedPermission {
  data: JwtPayloadUser;
  expiresAt: number;
}

const PERMISSION_CACHE_TTL_MS = 30_000; // 30 seconds
const PERMISSION_CACHE_MAX_SIZE = 500;
const permissionCache = new Map<string, CachedPermission>();

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

    const now = Date.now();
    const cached = permissionCache.get(payload.sub);
    if (cached && cached.expiresAt > now) {
      return cached.data;
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

    // Evict oldest entries if cache grows too large
    if (permissionCache.size >= PERMISSION_CACHE_MAX_SIZE) {
      const firstKey = permissionCache.keys().next().value;
      if (firstKey) permissionCache.delete(firstKey);
    }
    permissionCache.set(payload.sub, {
      data: result,
      expiresAt: now + PERMISSION_CACHE_TTL_MS,
    });

    return result;
  }
}

/** Exported for use after role/permission changes to force re-fetch */
export function invalidatePermissionCache(userId?: string): void {
  if (userId) {
    permissionCache.delete(userId);
  } else {
    permissionCache.clear();
  }
}
