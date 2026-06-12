import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequestService } from './request.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { InspectionReportDto } from './dto/inspection-report.dto';
import { ResolveRequestDto } from './dto/resolve-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('requests')
export class RequestController {
  constructor(private readonly request_service: RequestService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new request' })
  async create(@Body() create_dto: CreateRequestDto, @CurrentUser() user: any) {
    const data = await this.request_service.create(create_dto, user.id, user.email);
    return { success: true, data };
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Get requests of the authenticated citizen' })
  async findMine(@CurrentUser() user: any) {
    const data = await this.request_service.findByCitizen(user.id);
    return { success: true, data };
  }

  @Get()
  @Roles(Role.SECRETARY, Role.SUPERADMIN, Role.TECHNICIAN, Role.FINANCIAL)
  @ApiOperation({ summary: 'List all requests (optional: filter by status)' })
  async findAll(@Query('status') status?: string) {
    const data = await this.request_service.findAll(status);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific request' })
  async findOne(@Param('id') id: string) {
    const data = await this.request_service.findOne(id);
    return { success: true, data };
  }

  @Patch(':id/status')
  @Roles(Role.SECRETARY, Role.SUPERADMIN, Role.TECHNICIAN, Role.FINANCIAL)
  @ApiOperation({ summary: 'Update the status of a request' })
  async updateStatus(
    @Param('id') id: string,
    @Body() update_dto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.updateStatus(id, update_dto, user);
    return { success: true, data };
  }

  @Post(':id/schedule')
  @Roles(Role.SECRETARY, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Schedule technical inspection and transition to INSPECTION status' })
  async scheduleInspection(
    @Param('id') id: string,
    @Body() schedule_dto: ScheduleInspectionDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.scheduleInspection(id, schedule_dto, user);
    return { success: true, data };
  }

  @Post(':id/inspection-report')
  @Roles(Role.TECHNICIAN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Upload technical report and photos' })
  @UseInterceptors(FilesInterceptor('photos', 5))
  async uploadInspectionReport(
    @Param('id') id: string,
    @Body() report_dto: InspectionReportDto,
    @UploadedFiles() photos: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.uploadInspectionReport(id, report_dto, photos, user);
    return { success: true, data };
  }

  @Post(':id/resolve')
  @Roles(Role.SECRETARY, Role.SUPERADMIN, Role.FINANCIAL)
  @ApiOperation({ summary: 'Resolve request (approve, reject, or send to payment)' })
  async resolve(
    @Param('id') id: string,
    @Body() resolve_dto: ResolveRequestDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.request_service.resolve(id, resolve_dto, user);
    return { success: true, data };
  }
}
