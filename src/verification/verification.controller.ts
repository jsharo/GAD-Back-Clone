import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify-email')
  @ApiOperation({ summary: 'Validate email verification code' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.verificationService.verifyEmail(dto.email, dto.code);
    return { success: true, message: 'Email verified successfully.' };
  }
}
