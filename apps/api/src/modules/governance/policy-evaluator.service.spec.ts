import { describe, expect, it } from '@jest/globals';

import { PolicyEvaluatorService } from './policy-evaluator.service';

describe('PolicyEvaluatorService', () => {
  const svc = new PolicyEvaluatorService();

  it('selects branch-specific policy over global policy', () => {
    const policy = svc.evaluate(
      {
        entityType: 'expense_entry',
        actionType: 'approve',
        companyId: 'c1',
        branchId: 'b1',
        amount: 1500,
      },
      [
        {
          id: 'global',
          companyId: 'c1',
          branchId: null,
          entityType: 'expense_entry',
          actionType: 'approve',
          thresholdAmount: '1000',
          thresholdPct: null,
          approvalStepsJson: [{ stepOrder: 1 }],
          isEnabled: true,
        },
        {
          id: 'branch',
          companyId: 'c1',
          branchId: 'b1',
          entityType: 'expense_entry',
          actionType: 'approve',
          thresholdAmount: '1000',
          thresholdPct: null,
          approvalStepsJson: [{ stepOrder: 1 }],
          isEnabled: true,
        },
      ],
    );

    expect(policy?.id).toBe('branch');
  });

  it('returns null when threshold is not met', () => {
    const policy = svc.evaluate(
      {
        entityType: 'sale_transaction',
        actionType: 'discount_override',
        companyId: 'c1',
        branchId: 'b1',
        percentage: 0.05,
      },
      [
        {
          id: 'p1',
          companyId: 'c1',
          branchId: 'b1',
          entityType: 'sale_transaction',
          actionType: 'discount_override',
          thresholdAmount: null,
          thresholdPct: '0.1000',
          approvalStepsJson: [{ stepOrder: 1 }],
          isEnabled: true,
        },
      ],
    );

    expect(policy).toBeNull();
  });
});
