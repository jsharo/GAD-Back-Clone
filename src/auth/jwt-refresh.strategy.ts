/**
 * jwt-refresh.strategy.ts — Passport strategy for the Refresh Token.
 * Used exclusively on the POST /auth/refresh route.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET || 'jwt_refresh_secret_dev',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const refresh_token = req.body?.refreshToken;

    if (!refresh_token) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    // TODO:
    // 1. Find the user by payload.sub
    // 2. Compare bcrypt.compare(refresh_token, user.refresh_token)
    // 3. If not matching: throw new ForbiddenException()
    // 4. Return the full user object

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      refresh_token,
    };
  }
}
