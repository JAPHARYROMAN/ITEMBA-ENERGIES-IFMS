import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayloadUser } from '../decorators/current-user.decorator';
import { AuthService } from '../auth.service';

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayloadUser> {
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid token type');
    const userWithPerms = await this.authService.getUserWithPermissions(payload.sub);
    if (!userWithPerms) throw new UnauthorizedException('User not found');
    return {
      sub: userWithPerms.id,
      email: userWithPerms.email,
      permissions: userWithPerms.permissions,
    };
  }
}
