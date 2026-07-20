import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';

@ApiTags('auth')
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset code' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const data = await this.passwordResetService.forgotPassword(dto.email);
    return { success: true, ...data };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with email code' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const data = await this.passwordResetService.resetPassword(
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return { success: true, ...data };
  }
}
