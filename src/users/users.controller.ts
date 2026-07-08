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
import { CreateUserDto } from './dto/create-user.dto';
import { CreateInstitutionalUserDto } from './dto/create-institutional-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly registrationService: RegistrationService,
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get(':id')
  @Roles(Role.ADMINISTRATOR, Role.SECRETARY)
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
  @ApiOperation({ summary: 'Soft delete user' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; email: string },
  ) {
    const data = await this.usersService.softDelete(id, actor);
    return { success: true, data };
  }
}
