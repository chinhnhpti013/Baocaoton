/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClaimData {
  id: string;
  gdvCode: string;
  claimNumber: string;
  receivedDate: Date;
  status: string;
  resolvedDate?: Date;
  type: string; // Nghiệp vụ: TNDS, VCX
  agingDays: number;
  isResolved: boolean;
  isPending: boolean;
  isOver45: boolean;
  garageName: string;
  estimatedAmount: number;
  paidAmount: number;
}

export interface GarageRevenueReport {
  garageName: string;
  claimCount: number;
  totalEstimated: number;
  totalPaid: number;
}

export interface ComprehensiveReport {
  gdvCode: string;
  ton2025: number;
  hsps2026: number;
  totalNeeded: number;
  resolved2026: number;
  pending0_30: number;
  pending30_45: number;
  pending45_90: number;
  pendingAbove90: number;
  pendingTNDS: number;
  pendingVCX: number;
  totalPending: number;
  avgHsps2025: number;
  ratioPendingTotal: number;
  ratioOver45Pending: number;
  ratioPendingAvg: number;
  warningLevel: string;
}

export interface GDVReport {
  gdvCode: string;
  resolvedCount: number;
  pendingCount: number;
  totalCount: number;
  pendingRate: number;
  pendingUnder45: number;
  pendingOver45: number;
  over45Ratio: number;
}

