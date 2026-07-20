import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RolesService } from '../roles/roles.service';
import { VerificationService } from '../verification/verification.service';
import { Role } from '../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

type RegisterOptions = {
  roleName: string;
  assignedById: string;
  auditAction: string;
  successMessage: string;
  sendVerificationEmail?: boolean;
};

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly verificationService: VerificationService,
    private readonly auditService: AuditService,
  ) {}

  private async sendVerificationEmail(userId: string, email: string) {
    const code = await this.verificationService.createVerificationCode(userId);
    await this.verificationService.sendVerificationEmail(email, code);
  }

  /**
   * Registration is atomic w.r.t. verification email:
   * if sending the email fails, the created user (and related rows) are hard-deleted
   * so the email can be registered again and the client never gets a half-created account.
   */
  private async register(dto: CreateUserDto, options: RegisterOptions) {
    const user = await this.usersService.create(dto);

    try {
      const assignedById =
        options.assignedById === 'self-registration' ? user.id : options.assignedById;

      await this.rolesService.assignRole(user.id, options.roleName, assignedById);

      if (options.sendVerificationEmail !== false) {
        await this.sendVerificationEmail(user.id, user.email);
      }

      await this.auditService.logAction(
        assignedById,
        user.email,
        options.auditAction,
        `User registered: ${user.email} with role ${options.roleName}`,
      );

      return { message: options.successMessage, user };
    } catch (error) {
      this.logger.error(
        `Registration failed for ${user.email}; rolling back user ${user.id}`,
        error instanceof Error ? error.stack : undefined,
      );

      try {
        await this.usersService.hardDelete(user.id);
      } catch (rollbackError) {
        this.logger.error(
          `Failed to rollback user ${user.id} after registration error`,
          rollbackError instanceof Error ? rollbackError.stack : undefined,
        );
      }

      // Re-throw original error (e.g. email 500) so the client sees the real failure
      throw error;
    }
  }

  registerCitizen(dto: CreateUserDto) {
    return this.register(dto, {
      roleName: Role.CITIZEN,
      assignedById: 'self-registration',
      auditAction: 'REGISTER_CITIZEN',
      successMessage: 'User registered successfully. Check your email for verification code.',
    });
  }

  registerArchitect(dto: CreateUserDto) {
    return this.register(dto, {
      roleName: Role.USER,
      assignedById: 'self-registration',
      auditAction: 'REGISTER_ARCHITECT',
      successMessage: 'Architect registration received. Verify your email to continue.',
    });
  }

  registerInstitutional(
    dto: CreateUserDto,
    roleName: string,
    admin: { id: string; email: string },
  ) {
    return this.register(dto, {
      roleName,
      assignedById: admin.id,
      auditAction: 'CREATE_USER_INSTITUTIONAL',
      successMessage: 'Institutional user created successfully.',
      sendVerificationEmail: false,
    });
  }
}
