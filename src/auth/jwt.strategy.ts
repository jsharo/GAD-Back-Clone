import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UserStatus } from '@prisma/client';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(), // fallback para Swagger / Postman
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'jwt_secret_dev',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: payload.role,
    };
  }
}
