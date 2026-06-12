import { Controller, Post, Body, UseGuards, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterArchitectDto } from './dto/register-architect.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth_service: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Log in and obtain JWT tokens' })
  async login(@Body() login_dto: LoginDto) {
    const data = await this.auth_service.login(login_dto);
    return { success: true, data };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new citizen' })
  async register(@Body() register_dto: RegisterDto) {
    const data = await this.auth_service.register(register_dto);
    return { success: true, ...data };
  }

  @Post('register-architect')
  @ApiOperation({ summary: 'Register an architect with manual validation and file attachment' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('degree_file'))
  async registerArchitect(
    @Body() register_dto: RegisterArchitectDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // TODO: configure Multer options to validate size/type in the module
    const data = await this.auth_service.registerArchitect(register_dto, file);
    return { success: true, ...data };
  }

  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @ApiOperation({ summary: 'Renew Access Token using Refresh Token' })
  async refreshTokens(@Req() req) {
    const user_id = req.user.id;
    const refresh_token = req.user.refresh_token;
    const data = await this.auth_service.refreshTokens(user_id, refresh_token);
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Log out (invalidates refresh token)' })
  async logout(@CurrentUser() user: any) {
    const data = await this.auth_service.logout(user.id);
    return { success: true, ...data };
  }
}
