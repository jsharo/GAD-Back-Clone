import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestType, PropertyZone } from '@prisma/client';

export interface FeeCalculation {
  /** Final amount to charge in USD */
  total: number;
  base_fee: number;
  area_charge: number;
  rate_per_m2: number;
  area_m2: number;
  description: string;
  /** Human-readable breakdown for the resolution document */
  breakdown: string;
}

/**
 * Default fee table used as fallback when the FeeRule table is empty.
 * GAD Cañar — values subject to revision by the Finance department.
 */
const DEFAULT_FEES: Record<RequestType, Record<PropertyZone, { base: number; rate: number; label: string }>> = {
  BUILDING_LINE: {
    URBAN: { base: 15.00, rate: 0.05, label: 'Building Line — Urban Zone' },
    RURAL: { base: 10.00, rate: 0.03, label: 'Building Line — Rural Zone' },
  },
  PLAN_APPROVAL: {
    URBAN: { base: 30.00, rate: 0.20, label: 'Plan Approval — Urban Zone' },
    RURAL: { base: 20.00, rate: 0.12, label: 'Plan Approval — Rural Zone' },
  },
  CONSTRUCTION_PERMIT: {
    URBAN: { base: 50.00, rate: 0.35, label: 'Construction Permit — Urban Zone' },
    RURAL: { base: 35.00, rate: 0.25, label: 'Construction Permit — Rural Zone' },
  },
};

@Injectable()
export class FeeRulesService {
  private readonly logger = new Logger(FeeRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate the payment fee for a given request type, zone, and area.
   * Looks up DB first; falls back to DEFAULT_FEES if no rule is found.
   *
   * Formula: total = base_fee + (area_m2 * rate_per_m2)
   * Minimum total is always the base_fee (area=0 or null is accepted).
   */
  async calculateFee(
    request_type: RequestType,
    zone: PropertyZone,
    area_m2: number | null,
  ): Promise<FeeCalculation> {
    const effective_area = area_m2 && area_m2 > 0 ? area_m2 : 0;

    // ── 1. Try DB rule first ──────────────────────────────────────────
    let base_fee: number;
    let rate_per_m2: number;
    let description: string;

    try {
      const db_rule = await this.prisma.feeRule.findUnique({
        where: { request_type_zone: { request_type, zone } },
      });

      if (db_rule) {
        base_fee    = db_rule.base_fee;
        rate_per_m2 = db_rule.rate_per_m2;
        description = db_rule.description;
      } else {
        throw new Error('No DB rule found — using defaults');
      }
    } catch {
      // ── 2. Fallback to hardcoded defaults ─────────────────────────
      this.logger.warn(
        `No fee rule in DB for ${request_type}/${zone}. Using default rates.`,
      );
      const def = DEFAULT_FEES[request_type]?.[zone];
      if (!def) {
        // Should never happen with current enums, but guard anyway
        base_fee    = 10.00;
        rate_per_m2 = 0.10;
        description = `Procedure ${request_type} — ${zone}`;
      } else {
        base_fee    = def.base;
        rate_per_m2 = def.rate;
        description = def.label;
      }
    }

    const area_charge = parseFloat((effective_area * rate_per_m2).toFixed(2));
    const total       = parseFloat((base_fee + area_charge).toFixed(2));

    const breakdown = [
      `Base fee: $${base_fee.toFixed(2)}`,
      effective_area > 0
        ? `Area charge: ${effective_area} m² × $${rate_per_m2}/m² = $${area_charge.toFixed(2)}`
        : 'No additional area charge (area not recorded)',
      `TOTAL: $${total.toFixed(2)}`,
    ].join(' | ');

    return {
      total,
      base_fee,
      area_charge,
      rate_per_m2,
      area_m2: effective_area,
      description,
      breakdown,
    };
  }
}
