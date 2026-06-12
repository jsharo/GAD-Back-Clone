/**
 * jwt.strategy.ts — Passport strategy to validate the JWT Access Token.
 * Reads the Bearer token from the Authorization header and decodes it.
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;   // User ID
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'jwt_secret_dev',
    });
  }

  async validate(payload: JwtPayload) {
    // TODO: find the user in the DB and verify that they are active
    // const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    // if (!user || !user.active) throw new UnauthorizedException()
    // return user

    // Minimum return to make req.user available
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
