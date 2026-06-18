import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private calculateHashChainValue(payload: {
    previous_hash: string | null;
    user_id: string | null;
    user_email: string;
    action: string;
    details: string;
    ip_address: string | null;
    created_at: string;
  }) {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async logAction(
    user_id: string | null,
    user_email: string,
    action: string,
    details: string,
    ip_address?: string,
  ) {
    try {
      const previous_log = await this.prisma.auditLog.findFirst({
        orderBy: [
          { created_at: 'desc' },
          { id: 'desc' },
        ],
      });
      const previous_hash = previous_log?.current_hash || null;
      const created_at = new Date();
      const current_hash = this.calculateHashChainValue({
        previous_hash,
        user_id,
        user_email,
        action,
        details,
        ip_address: ip_address || null,
        created_at: created_at.toISOString(),
      });

      await this.prisma.auditLog.create({
        data: {
          user_id,
          user_email,
          action,
          details,
          ip_address: ip_address || null,
          previous_hash,
          current_hash,
          created_at,
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
    const logs = await this.prisma.auditLog.findMany({
      orderBy: [
        { created_at: 'asc' },
        { id: 'asc' },
      ],
    });
    let legacy_logs = 0;
    let checked_logs = 0;
    let previous_hash: string | null = null;

    for (const log of logs) {
      if (!log.current_hash) {
        legacy_logs += 1;
        continue;
      }

      if (log.previous_hash !== previous_hash) {
        return {
          valid: false,
          message: 'Audit hash chain integrity violation detected.',
          failed_log_id: log.id,
          reason: `previous_hash mismatch. Expected ${previous_hash || 'null'} but found ${log.previous_hash || 'null'}.`,
        };
      }

      const recalculated_hash = this.calculateHashChainValue({
        previous_hash: log.previous_hash,
        user_id: log.user_id,
        user_email: log.user_email,
        action: log.action,
        details: log.details,
        ip_address: log.ip_address,
        created_at: log.created_at.toISOString(),
      });

      if (log.current_hash !== recalculated_hash) {
        return {
          valid: false,
          message: 'Audit hash chain integrity violation detected.',
          failed_log_id: log.id,
          reason: 'current_hash does not match recalculated SHA-256 value.',
        };
      }

      checked_logs += 1;
      previous_hash = log.current_hash;
    }

    return {
      valid: true,
      message: 'Audit hash chain is valid.',
      checked_logs,
      legacy_logs,
    };
  }
}
