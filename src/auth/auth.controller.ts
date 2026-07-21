import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const IS_PROD = process.env.NODE_ENV === 'production';

/** Cross-origin (Vercel ↔ Render) requires SameSite=None + Secure in production. */
const COOKIE_BASE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax',
};

function setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, {
    ...COOKIE_BASE,
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_BASE,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    path: '/api/v1/auth',
  });
}

function clearTokenCookies(res: Response) {
  res.clearCookie('access_token', { ...COOKIE_BASE });
  res.clearCookie('refresh_token', { ...COOKIE_BASE, path: '/api/v1/auth' });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Log in and obtain JWT tokens (set as httpOnly cookies)' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket.remoteAddress;
    const agent = req.headers['user-agent'];
    const { accessToken, refreshToken, user } = await this.authService.login(loginDto, {
      ip,
      agent,
    });
    setTokenCookies(res, accessToken, refreshToken);
    return { success: true, data: { user } };
  }

  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({ summary: 'Renew tokens using the refresh_token cookie' })
  async refreshTokens(
    @Req() req: Request & { user: { id: string; refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket.remoteAddress;
    const agent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      req.user.id,
      req.user.refreshToken,
      { ip, agent },
    );
    setTokenCookies(res, accessToken, refreshToken);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Log out and clear session cookies' })
  async logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.logout(user.id);
    clearTokenCookies(res);
    return { success: true, ...data };
  }
}
