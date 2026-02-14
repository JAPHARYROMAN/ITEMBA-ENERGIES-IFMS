import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import {
  users,
  refreshTokens,
  userRoles,
  rolePermissions,
  permissions,
} from '../../database/schema/auth';

type Schema = typeof schema;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  status: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<{ id: string; email: string; name: string } | null> {
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt)));
    if (!user || user.status !== 'active') return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  async login(user: { id: string; email: string; name: string }): Promise<TokenPair> {
    const accessTtl = this.configService.get<number>('JWT_ACCESS_TTL', 900);
    const refreshDays = this.configService.get<number>('JWT_REFRESH_DAYS', 7);
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, type: 'access' },
      { expiresIn: accessTtl },
    );
    const rawRefresh = crypto.randomBytes(32).toString('hex');
    const hashedRefresh = await this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      token: hashedRefresh,
      expiresAt,
    });
    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: accessTtl,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const hashed = await this.hashRefreshToken(refreshToken);
    const [row] = await this.db
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.token, hashed));
    if (!row || row.revokedAt || new Date() > row.expiresAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const [userRow] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.userId));
    if (!userRow) throw new UnauthorizedException('User not found');
    const user = { id: userRow.id, email: userRow.email, name: userRow.name };
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));
    return this.login(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const hashed = await this.hashRefreshToken(refreshToken);
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.token, hashed));
  }

  async getMe(userId: string): Promise<MeResponse | null> {
    const [u] = await this.db
      .select({ id: users.id, email: users.email, name: users.name, status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u) return null;
    const perms = await this.getPermissionCodesForUser(u.id);
    return { id: u.id, email: u.email, name: u.name, status: u.status, permissions: perms };
  }

  async getUserWithPermissions(userId: string): Promise<{ id: string; email: string; permissions: string[] } | null> {
    const [u] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u) return null;
    const permissionCodes = await this.getPermissionCodesForUser(u.id);
    return { id: u.id, email: u.email, permissions: permissionCodes };
  }

  private async getPermissionCodesForUser(userId: string): Promise<string[]> {
    const roleRows = await this.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    if (!roleRows.length) return [];
    const roleIds = roleRows.map((r) => r.roleId);
    const rows = await this.db
      .selectDistinct({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    return rows.map((r) => r.code);
  }

  private async hashRefreshToken(token: string): Promise<string> {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
