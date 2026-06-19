import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly verificationService: VerificationService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
  ) {}

  private async sendVerificationEmail(userId: string, email: string) {
    const code = await this.verificationService.createVerificationCode(userId);
    const subject = 'Verifica tu correo — GAD Cañar';
    const text = `Tu código de verificación es: ${code}. Expira en 15 minutos.`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f;margin:0 0 16px">GAD Municipal de Cañar</h2>
        <p style="color:#334155;line-height:1.5">Usa este código para verificar tu correo electrónico:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a5f;margin:24px 0">${code}</p>
        <p style="color:#64748b;font-size:14px">El código expira en 15 minutos. Si no solicitaste este registro, ignora este mensaje.</p>
      </div>
    `;

    await this.emailService.send({ to: email, subject, text, html });
  }

  private async register(dto: CreateUserDto, options: RegisterOptions) {
    const user = await this.usersService.create(dto);

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
