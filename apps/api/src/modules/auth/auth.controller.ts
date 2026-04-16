import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Options,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService, MeResponse, TokenPair } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { SignupDto } from "./dto/signup.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateUserStatusDto, AssignRoleDto } from "./dto/admin.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { JwtPayloadUser } from "./decorators/current-user.decorator";
import { Permissions } from "./decorators/permissions.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Login with email and password" })
  @ApiResponse({
    status: 200,
    description: "Returns access and refresh tokens",
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() dto: LoginDto): Promise<TokenPair> {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException("Invalid email or password");
    return this.authService.login(user);
  }

  @Public()
  @Options("signup")
  @HttpCode(204)
  signupAvailability(): void {
    if (!this.authService.isSelfSignupEnabled()) {
      throw new NotFoundException("Self-service signup is not available");
    }
  }

  @Public()
  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Register a new user account" })
  @ApiResponse({ status: 201, description: "Account created successfully" })
  @ApiResponse({ status: 409, description: "Email already in use" })
  async signup(@Body() dto: SignupDto): Promise<{ message: string }> {
    return this.authService.signup(dto);
  }

  @Public()
  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: "Request a password reset email" })
  @ApiResponse({
    status: 201,
    description: "Reset instructions sent if account exists",
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message:
        "If an account exists with that email, reset instructions have been sent.",
    };
  }

  @Public()
  @Post("reset-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Reset password using token from email" })
  @ApiResponse({ status: 201, description: "Password reset successfully" })
  @ApiResponse({ status: 400, description: "Invalid or expired token" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Post("refresh")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({ status: 200, description: "Returns new token pair" })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post("logout")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Logout (invalidate refresh token)" })
  @ApiResponse({ status: 201, description: "Refresh token revoked" })
  async logout(@Body() dto: RefreshDto): Promise<{ message: string }> {
    await this.authService.logout(dto.refreshToken);
    return { message: "Logged out" };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Get current user profile and permissions" })
  @ApiResponse({ status: 200, description: "Current user" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async me(@CurrentUser() user: JwtPayloadUser): Promise<MeResponse> {
    const me = await this.authService.getMe(user.sub);
    if (!me) throw new UnauthorizedException("User not found");
    return me;
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Change current user password" })
  @ApiResponse({ status: 201, description: "Password changed" })
  @ApiResponse({ status: 400, description: "Current password incorrect" })
  async changePassword(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ── Admin: User Management ───────────────────────────────────────────

  @Get("users")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "List all users (admin)" })
  async listUsers(): Promise<any[]> {
    return this.authService.listUsers();
  }

  @Post("users")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Create a user (admin)" })
  async createUser(
    @Body() dto: CreateUserDto,
  ): Promise<{ id: string }> {
    return this.authService.createUser(dto);
  }

  @Patch("users/:id/status")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Activate or deactivate a user (admin)" })
  async updateUserStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<{ message: string }> {
    await this.authService.updateUserStatus(id, dto.status);
    return { message: `User status updated to ${dto.status}` };
  }

  @Post("users/:id/roles")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Assign a role to user (admin)" })
  async assignRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ): Promise<{ message: string }> {
    await this.authService.assignRole(id, dto.roleCode);
    return { message: `Role ${dto.roleCode} assigned` };
  }

  @Delete("users/:id/roles/:roleCode")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Remove a role from user (admin)" })
  async removeRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("roleCode") roleCode: string,
  ): Promise<{ message: string }> {
    await this.authService.removeRole(id, roleCode);
    return { message: `Role ${roleCode} removed` };
  }

  @Get("roles")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions("setup:write")
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "List all roles and their permissions" })
  async listRoles(): Promise<any[]> {
    return this.authService.listRoles();
  }
}
