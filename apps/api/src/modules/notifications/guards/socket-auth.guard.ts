import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class SocketAuthGuard {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateSocket(socket: Socket): Promise<{ userId: string; permissions: string[] }> {
    try {
      // Get token from handshake auth or query parameter
      const token = this.extractToken(socket);
      
      if (!token) {
        throw new UnauthorizedException('No authentication token provided');
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      if (!payload.sub || !payload.permissions) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return {
        userId: payload.sub,
        permissions: payload.permissions,
      };
    } catch (error) {
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(socket: Socket): string | null {
    // Try to get token from handshake auth
    const authHeader = socket.handshake.auth.token;
    if (authHeader) {
      return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    }

    // Try to get token from query parameters (for fallback)
    const queryToken = socket.handshake.query.token as string;
    if (queryToken) {
      return queryToken.startsWith('Bearer ') ? queryToken.slice(7) : queryToken;
    }

    return null;
  }
}
