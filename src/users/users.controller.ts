import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RegistrationService } from './registration.service';
import { RecoveryEmailService } from './recovery-email.service';
import { ProfessionalVerificationService } from './professional-verification.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateInstitutionalUserDto } from './dto/create-institutional-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  SetRecoveryEmailDto,
  VerifyRecoveryEmailDto,
} from './dto/recovery-email.dto';
import { SubmitProfessionalProfileDto } from './dto/submit-professional-profile.dto';
import { ReviewProfessionalDto } from './dto/review-professional.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesService } from '../roles/roles.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly registrationService: RegistrationService,
    private readonly recoveryEmailService: RecoveryEmailService,
    private readonly professionalVerificationService: ProfessionalVerificationService,
    private readonly rolesService: RolesService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new citizen' })
  async registerCitizen(@Body() dto: CreateUserDto) {
    const data = await this.registrationService.registerCitizen(dto);
    return { success: true, ...data };
  }

  @Post('register-architect')
  @ApiOperation({ summary: 'Register a licensed professional (architect/engineer)' })
  async registerArchitect(@Body() dto: CreateUserDto) {
    const data = await this.registrationService.registerArchitect(dto);
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post('institutional')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Create an institutional user (admin only)' })
  async createInstitutional(
    @Body() dto: CreateInstitutionalUserDto,
    @CurrentUser() admin: { id: string; email: string },
  ) {
    const data = await this.registrationService.registerInstitutional(
      dto,
      dto.roleName,
      admin,
    );
    const user = await this.usersService.presentUser(data.user);
    return { success: true, message: data.message, user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get()
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List all active users' })
  async findAll(
    @Query('role') role?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Number(limit) || 100, 500) : 100;
    const data = await this.usersService.findAllForAdmin(role, parsedLimit);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get('technicians')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Get active technicians' })
  async findTechnicians() {
    const data = await this.usersService.findByRole(Role.TECHNICIAN);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get('dashboard/stats')
  @Roles(Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'User counts for the admin dashboard' })
  async getDashboardStats() {
    const data = await this.usersService.getDashboardStats();
    return { success: true, data };
  }

  // ── Self-service profile / recovery email (before :id) ───────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (incl. recovery email and permissions)' })
  async getMe(@CurrentUser() actor: { id: string }) {
    const profile = await this.recoveryEmailService.getMe(actor.id);
    const [role, permissions] = await Promise.all([
      this.rolesService.getUserRoleName(actor.id),
      this.rolesService.getEffectivePermissions(actor.id),
    ]);
    return {
      success: true,
      data: {
        ...profile,
        role,
        permissions,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me/permissions')
  @ApiOperation({ summary: 'Get effective permissions for the authenticated user' })
  async getMyPermissions(@CurrentUser() actor: { id: string }) {
    const permissions = await this.rolesService.getEffectivePermissions(actor.id);
    return { success: true, data: { permissions } };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: 'Update own name, lastname and cedula' })
  async updateOwnProfile(
    @CurrentUser() actor: { id: string; email: string },
    @Body() dto: UpdateOwnProfileDto,
  ) {
    const data = await this.usersService.updateOwnProfile(actor.id, dto, actor);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('me/recovery-email')
  @ApiOperation({ summary: 'Set or change recovery email (sends verification code)' })
  async setRecoveryEmail(
    @CurrentUser() actor: { id: string },
    @Body() dto: SetRecoveryEmailDto,
  ) {
    const data = await this.recoveryEmailService.setRecoveryEmail(
      actor.id,
      dto.recoveryEmail,
    );
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('me/recovery-email/verify')
  @ApiOperation({ summary: 'Verify recovery email with 6-digit code' })
  async verifyRecoveryEmail(
    @CurrentUser() actor: { id: string },
    @Body() dto: VerifyRecoveryEmailDto,
  ) {
    const data = await this.recoveryEmailService.verifyRecoveryEmail(
      actor.id,
      dto.code,
    );
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('me/recovery-email')
  @ApiOperation({ summary: 'Remove recovery email' })
  async removeRecoveryEmail(@CurrentUser() actor: { id: string }) {
    const data = await this.recoveryEmailService.removeRecoveryEmail(actor.id);
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('me/professional-profile')
  @ApiOperation({
    summary:
      'Architect submits name, lastname, cedula and SENESCYT code for secretary verification',
  })
  async submitProfessionalProfile(
    @CurrentUser() actor: { id: string },
    @Body() dto: SubmitProfessionalProfileDto,
  ) {
    const data = await this.professionalVerificationService.submitProfile(
      actor.id,
      dto,
    );
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get('professional-verifications/pending')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'List architects pending professional verification' })
  async listPendingProfessionals() {
    const data = await this.professionalVerificationService.listPending();
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post(':id/professional-verify')
  @Roles(Role.SECRETARY, Role.ADMINISTRATOR)
  @ApiOperation({ summary: 'Approve or reject architect professional verification' })
  async reviewProfessional(
    @Param('id') id: string,
    @Body() dto: ReviewProfessionalDto,
    @CurrentUser() actor: { id: string; email: string },
  ) {
    const data = await this.professionalVerificationService.review(
      id,
      dto.approved,
      actor,
    );
    return { success: true, ...data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get(':id')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'Get user by id' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const data = await this.usersService.presentUser(user);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Update user profile fields' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: { id: string; email: string },
  ) {
    const data = await this.usersService.update(id, dto, actor);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Patch(':id/status')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Activate or deactivate user' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: { id: string; email: string },
  ) {
    const data = await this.usersService.setStatus(id, dto.status, actor);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @Roles(Role.ADMINISTRATOR)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Soft delete user' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; email: string },
  ) {
    const data = await this.usersService.softDelete(id, actor);
    return { success: true, data };
  }
}
