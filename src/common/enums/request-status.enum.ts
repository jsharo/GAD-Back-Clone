/**
 * request-status.enum.ts — Request status enum.
 * Flow: PENDING_SECRETARY → PENDING_TECHNICIAN → INSPECTION → PENDING_PAYMENT → PAID → APPROVED/REJECTED
 * Lateral status: OBSERVED (secretary returns to citizen for corrections)
 */

export enum RequestStatus {
  DRAFT              = 'DRAFT',
  PENDING_SECRETARY  = 'PENDING_SECRETARY',
  OBSERVED           = 'OBSERVED',
  PENDING_TECHNICIAN = 'PENDING_TECHNICIAN',
  INSPECTION         = 'INSPECTION',
  PENDING_PAYMENT    = 'PENDING_PAYMENT',
  PAID               = 'PAID',
  APPROVED           = 'APPROVED',
  REJECTED           = 'REJECTED',
}
