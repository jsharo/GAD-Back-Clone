import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterArchitectDto } from './dto/register-architect.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt_service: JwtService,
    private readonly audit_service: AuditService,
  ) {}

  async login(login_dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: login_dto.email },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const is_password_valid = await bcrypt.compare(login_dto.password, user.password_hash);
    if (!is_password_valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const access_token = this.jwt_service.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refresh_token = this.jwt_service.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: '7d' },
    );

    const hashed_refresh_token = await bcrypt.hash(refresh_token, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: hashed_refresh_token },
    });

    await this.audit_service.logAction(
      user.id,
      user.email,
      'LOGIN',
      `User ${user.email} logged in successfully`,
    );

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(register_dto: RegisterDto) {
    const existing_email = await this.prisma.user.findUnique({
      where: { email: register_dto.email },
    });
    if (existing_email) {
      throw new ConflictException('Email is already registered');
    }

    const existing_national_id = await this.prisma.user.findUnique({
      where: { national_id: register_dto.national_id },
    });
    if (existing_national_id) {
      throw new ConflictException('National ID is already registered');
    }

    const hashed_password = await bcrypt.hash(register_dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: register_dto.email,
        password_hash: hashed_password,
        first_name: register_dto.first_name,
        last_name: register_dto.last_name,
        national_id: register_dto.national_id,
        phone: register_dto.phone || null,
        role: Role.CITIZEN,
        active: true,
      },
    });

    await this.audit_service.logAction(
      user.id,
      user.email,
      'REGISTER_CITIZEN',
      `Citizen registered: ${user.email}`,
    );

    return {
      message: 'User registered successfully',
    };
  }

  async registerArchitect(register_dto: RegisterArchitectDto, file: Express.Multer.File) {
    const existing_email = await this.prisma.user.findUnique({
      where: { email: register_dto.email },
    });
    if (existing_email) {
      throw new ConflictException('Email is already registered');
    }

    const existing_national_id = await this.prisma.user.findUnique({
      where: { national_id: register_dto.national_id },
    });
    if (existing_national_id) {
      throw new ConflictException('National ID is already registered');
    }

    let file_url = '';
    if (file) {
      const upload_dir = './uploads';
      if (!fs.existsSync(upload_dir)) {
        fs.mkdirSync(upload_dir, { recursive: true });
      }
      const file_name = `${Date.now()}-${file.originalname}`;
      const file_path = path.join(upload_dir, file_name);
      fs.writeFileSync(file_path, file.buffer);
      file_url = `/uploads/${file_name}`;
    }

    const hashed_password = await bcrypt.hash(register_dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: register_dto.email,
        password_hash: hashed_password,
        first_name: register_dto.first_name,
        last_name: register_dto.last_name,
        national_id: register_dto.national_id,
        phone: register_dto.phone || null,
        role: Role.ARCHITECT,
        active: true,
        enabled: false,
        degree: register_dto.degree,
        registration_number: register_dto.registration_number,
      },
    });

    await this.audit_service.logAction(
      user.id,
      user.email,
      'REGISTER_ARCHITECT',
      `Architect registered (pending approval): ${user.email}, degree file saved to: ${file_url}`,
    );

    return {
      message: 'Architect request received. Pending manual validation.',
    };
  }

  async refreshTokens(user_id: string, refresh_token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: user_id },
    });

    if (!user || !user.refresh_token || !user.active) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const is_refresh_token_valid = await bcrypt.compare(refresh_token, user.refresh_token);
    if (!is_refresh_token_valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const access_token = this.jwt_service.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const new_refresh_token = this.jwt_service.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      { expiresIn: '7d' },
    );

    const hashed_refresh_token = await bcrypt.hash(new_refresh_token, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: hashed_refresh_token },
    });

    return {
      accessToken: access_token,
      refreshToken: new_refresh_token,
    };
  }

  async logout(user_id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: user_id },
    });

    if (user) {
      await this.prisma.user.update({
        where: { id: user_id },
        data: { refresh_token: null },
      });

      await this.audit_service.logAction(
        user.id,
        user.email,
        'LOGOUT',
        `User ${user.email} logged out successfully`,
      );
    }

    return {
      message: 'Session closed successfully',
    };
  }
}
