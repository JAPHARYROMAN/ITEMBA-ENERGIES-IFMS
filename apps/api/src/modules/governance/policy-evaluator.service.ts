import { Injectable } from '@nestjs/common';
import type { ApprovalPolicyStep } from '../../database/schema';

export interface EvaluatePolicyInput {
  entityType: string;
  actionType: string;
  companyId: string;
  branchId: string;
  amount?: number;
  percentage?: number;
}

export interface EvaluatedPolicy {
  id: string;
  companyId: string;
  branchId: string | null;
  entityType: string;
  actionType: string;
  thresholdAmount: string | null;
  thresholdPct: string | null;
  approvalStepsJson: ApprovalPolicyStep[];
  isEnabled: boolean;
}

@Injectable()
export class PolicyEvaluatorService {
  evaluate(input: EvaluatePolicyInput, policies: EvaluatedPolicy[]): EvaluatedPolicy | null {
    const candidates = policies
      .filter((p) => p.isEnabled)
      .filter((p) => p.companyId === input.companyId)
      .filter((p) => p.entityType === input.entityType)
      .filter((p) => p.actionType === input.actionType)
      .filter((p) => p.branchId === input.branchId || p.branchId === null)
      .filter((p) => this.thresholdMatch(p, input.amount, input.percentage));

    const branchSpecific = candidates.find((p) => p.branchId === input.branchId);
    return branchSpecific ?? candidates.find((p) => p.branchId === null) ?? null;
  }

  thresholdMatch(policy: EvaluatedPolicy, amount?: number, percentage?: number): boolean {
    const amountThreshold = policy.thresholdAmount ? Number(policy.thresholdAmount) : null;
    const pctThreshold = policy.thresholdPct ? Number(policy.thresholdPct) : null;
    const amountMet = amountThreshold == null ? true : (amount ?? 0) > amountThreshold;
    const pctMet = pctThreshold == null ? true : (percentage ?? 0) > pctThreshold;
    return amountMet && pctMet;
  }
}
