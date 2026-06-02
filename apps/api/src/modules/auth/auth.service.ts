import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Inject } from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, isNull, inArray, gt } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import * as crypto from "node:crypto";
import { DRIZZLE } from "../../database/database.module";
import type * as schema from "../../database/schema";
import {
  users,
  refreshTokens,
  userRoles,
  rolePermissions,
  permissions,
  roles,
  passwordResetTokens,
  userBranches,
} from "../../database/schema/auth";
import { stations } from "../../database/schema/core/stations";
import { branches } from "../../database/schema/core/branches";
import { EmailTransport } from "../notifications/transports/email.transport";
import { invalidatePermissionCache } from "./strategies/permission-cache";

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

interface UserAuthorizationContext {
  permissions: string[];
  companyScopes: string[];
  roleCodes: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Schema>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly emailTransport: EmailTransport,
  ) {}

  isSelfSignupEnabled(): boolean {
    return this.configService.get<boolean>("AUTH_SELF_SIGNUP_ENABLED", false);
  }

  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 15;

  async validateUser(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string; name: string } | null> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        status: users.status,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(
        and(
          eq(users.email, email.toLowerCase().trim()),
          isNull(users.deletedAt),
        ),
      );
    if (!user || user.status !== "active") return null;

    // Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new UnauthorizedException(
        `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const updates: Record<string, unknown> = {
        failedLoginAttempts: attempts,
      };
      if (attempts >= this.MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = new Date(
          Date.now() + this.LOCKOUT_DURATION_MINUTES * 60_000,
        );
        this.logger.warn(
          `Account locked for ${user.email} after ${attempts} failed attempts`,
        );
      }
      await this.db.update(users).set(updates).where(eq(users.id, user.id));
      return null;
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
    }

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(user: {
    id: string;
    email: string;
    name: string;
  }): Promise<TokenPair> {
    const accessTtl = this.configService.get<number>("JWT_ACCESS_TTL", 900);
    const refreshDays = this.configService.get<number>("JWT_REFRESH_DAYS", 7);

    const authorization = await this.getAuthorizationContextForUser(user.id);
    const jwtPermissions = [
      ...new Set([
        ...authorization.permissions,
        ...authorization.companyScopes,
      ]),
    ];

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        type: "access",
        permissions: jwtPermissions,
      },
      { expiresIn: accessTtl },
    );
    const rawRefresh = crypto.randomBytes(32).toString("hex");
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

  async signup(dto: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ message: string }> {
    if (!this.isSelfSignupEnabled()) {
      throw new NotFoundException("Self-service signup is not available");
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check if user already exists
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail));
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.db.insert(users).values({
      email: normalizedEmail,
      passwordHash,
      name: dto.name.trim(),
      status: "active",
    });

    return { message: "Account created successfully. You can now sign in." };
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)));

    // Always return success to prevent email enumeration
    if (!user) return;

    // Generate reset token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused reset tokens for this user
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const smtpHost = this.configService.get<string>("SMTP_HOST");
    if (!smtpHost) {
      this.logger.warn(
        `Password reset requested for ${user.email}, but SMTP is not configured. Reset email was not sent.`,
      );
      return;
    }

    const appOrigin = this.configService
      .get<string>("FRONTEND_ORIGIN", "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .find(Boolean);
    const resetLink = appOrigin
      ? `${appOrigin.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`
      : undefined;

    await this.emailTransport.send({
      to: user.email,
      subject: "Reset your IFMS password",
      body: [
        "A password reset was requested for your IFMS account.",
        "",
        `Reset token: ${rawToken}`,
        resetLink ? `Reset link: ${resetLink}` : undefined,
        `This token expires at ${expiresAt.toISOString()}.`,
        "",
        "If you did not request this reset, you can ignore this email.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [resetRecord] = await this.db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));

    if (
      !resetRecord ||
      resetRecord.usedAt ||
      new Date() > resetRecord.expiresAt
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetRecord.userId));
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetRecord.id));

    // Revoke all refresh tokens for the user
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, resetRecord.userId),
          isNull(refreshTokens.revokedAt),
        ),
      );

    return {
      message:
        "Password has been reset successfully. Please sign in with your new password.",
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) throw new NotFoundException("User not found");

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException("Current password is incorrect");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { message: "Password changed successfully." };
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
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    const [userRow] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, row.userId));
    if (!userRow) throw new UnauthorizedException("User not found");
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
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u) return null;
    const authorization = await this.getAuthorizationContextForUser(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      permissions: [
        ...new Set([
          ...authorization.permissions,
          ...authorization.companyScopes,
        ]),
      ],
    };
  }

  async getUserWithPermissions(
    userId: string,
  ): Promise<{ id: string; email: string; permissions: string[] } | null> {
    const [u] = await this.db
      .select({ id: users.id, email: users.email, status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!u || u.status !== "active") return null;
    const authorization = await this.getAuthorizationContextForUser(u.id);
    return {
      id: u.id,
      email: u.email,
      permissions: [
        ...new Set([
          ...authorization.permissions,
          ...authorization.companyScopes,
        ]),
      ],
    };
  }

  private async getAuthorizationContextForUser(
    userId: string,
  ): Promise<UserAuthorizationContext> {
    const roleAssignments = await this.getRoleAssignmentsForUser(userId);
    const roleCodes = roleAssignments.map((role) => role.code);
    const roleIds = roleAssignments.map((role) => role.id);

    const [permissionCodes, companyScopes] = await Promise.all([
      this.getPermissionCodesForRoleIds(roleIds),
      this.getCompanyScopesForUser(userId, roleCodes),
    ]);

    return {
      roleCodes,
      permissions: [...new Set(permissionCodes)],
      companyScopes: [...new Set(companyScopes)],
    };
  }

  private async getRoleAssignmentsForUser(
    userId: string,
  ): Promise<Array<{ id: string; code: string }>> {
    return this.db
      .selectDistinct({
        id: roles.id,
        code: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
  }

  private async getPermissionCodesForRoleIds(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];

    const rows = await this.db
      .selectDistinct({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    return rows.map((r) => r.code);
  }

  /** Resolve company:uuid and branch:uuid scopes for tenant isolation in JWT */
  private async getCompanyScopesForUser(
    userId: string,
    roleCodes: string[],
  ): Promise<string[]> {
    const branchRows = await this.db
      .selectDistinct({
        branchId: branches.id,
      })
      .from(userBranches)
      .innerJoin(branches, eq(userBranches.branchId, branches.id))
      .where(
        and(eq(userBranches.userId, userId), isNull(branches.deletedAt)),
      );

    const branchScopes = branchRows.map((r) => `branch:${r.branchId}`);

    if (branchRows.length > 0) {
      const branchIds = branchRows.map((r) => r.branchId);
      const companyRows = await this.db
        .selectDistinct({ companyId: stations.companyId })
        .from(branches)
        .innerJoin(stations, eq(branches.stationId, stations.id))
        .where(inArray(branches.id, branchIds));
      const companyScopes = companyRows.map((r) => `company:${r.companyId}`);
      return [...companyScopes, ...branchScopes];
    }

    if (!roleCodes.includes("manager")) {
      return [];
    }

    const allCompanyRows = await this.db
      .selectDistinct({ companyId: stations.companyId })
      .from(stations)
      .where(isNull(stations.deletedAt));
    const allBranchRows = await this.db
      .selectDistinct({ branchId: branches.id })
      .from(branches)
      .where(isNull(branches.deletedAt));
    return [
      ...allCompanyRows.map((r) => `company:${r.companyId}`),
      ...allBranchRows.map((r) => `branch:${r.branchId}`),
    ];
  }

  /** List all users (admin) */
  async listUsers(): Promise<
    Array<{
      id: string;
      email: string;
      name: string;
      status: string;
      roles: string[];
    }>
  > {
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(isNull(users.deletedAt));

    const result = [];
    for (const u of userRows) {
      const userRoleRows = await this.db
        .select({ code: roles.code })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, u.id));
      result.push({ ...u, roles: userRoleRows.map((r) => r.code) });
    }
    return result;
  }

  /** Create user (admin) */
  async createUser(dto: {
    name: string;
    email: string;
    password: string;
    roleCode?: string;
  }): Promise<{ id: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail));
    if (existing)
      throw new ConflictException("User with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [created] = await this.db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: dto.name.trim(),
        status: "active",
      })
      .returning({ id: users.id });

    if (dto.roleCode) {
      const [role] = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, dto.roleCode));
      if (role) {
        await this.db
          .insert(userRoles)
          .values({ userId: created.id, roleId: role.id });
      }
    }

    return { id: created.id };
  }

  /** Update user status (admin) */
  async updateUserStatus(
    userId: string,
    status: "active" | "inactive",
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (status === "inactive") {
      // Revoke all refresh tokens
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            isNull(refreshTokens.revokedAt),
          ),
        );
    }
    // Drop any cached permissions so the status change takes effect immediately
    invalidatePermissionCache(userId);
  }

  /** Assign role to user (admin) */
  async assignRole(userId: string, roleCode: string): Promise<void> {
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, roleCode));
    if (!role) throw new BadRequestException(`Role '${roleCode}' not found`);
    // Upsert — ignore if already assigned
    await this.db
      .insert(userRoles)
      .values({ userId, roleId: role.id })
      .onConflictDoNothing();
    // Drop cached permissions so the new role takes effect immediately
    invalidatePermissionCache(userId);
  }

  /** Remove role from user (admin) */
  async removeRole(userId: string, roleCode: string): Promise<void> {
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, roleCode));
    if (!role) return;
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
    // Drop cached permissions so the revocation takes effect immediately
    invalidatePermissionCache(userId);
  }

  /** List all roles */
  async listRoles(): Promise<
    Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      permissions: string[];
    }>
  > {
    const roleRows = await this.db
      .select()
      .from(roles)
      .where(isNull(roles.deletedAt));
    const result = [];
    for (const r of roleRows) {
      const permRows = await this.db
        .selectDistinct({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(
          permissions,
          eq(rolePermissions.permissionId, permissions.id),
        )
        .where(eq(rolePermissions.roleId, r.id));
      result.push({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        permissions: permRows.map((p) => p.code),
      });
    }
    return result;
  }

  private async hashRefreshToken(token: string): Promise<string> {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
