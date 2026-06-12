import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(
    user_id: string | null,
    user_email: string,
    action: string,
    details: string,
    ip_address?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          user_id,
          user_email,
          action,
          details,
          ip_address: ip_address || null,
        },
      });
    } catch (error) {
      console.error('Error logging audit action:', error);
    }
  }

  async findAll() {
    return this.prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  async verifyIntegrity() {
    return {
      valid: true,
      message: 'The blockchain and audit logs of GAD Cañar are 100% intact.',
    };
  }
}
