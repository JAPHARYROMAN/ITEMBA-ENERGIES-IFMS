import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditListQueryDto } from '../audit/dto/audit-list-query.dto';
import { CreateDipDto } from '../inventory/dto/create-dip.dto';
import { CreateReconciliationDto } from '../inventory/dto/create-reconciliation.dto';
import { InventoryMovementsListQueryDto } from '../inventory/dto/inventory-movements-list-query.dto';
import { ActionReasonDto } from './dto/action-reason.dto';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { CreatePolicyDto, PolicyStepDto } from './dto/create-policy.dto';
import { DecideApprovalStepDto } from './dto/decide-approval-step.dto';
import { ListApprovalsDto } from './dto/list-approvals.dto';
import { ListPoliciesDto } from './dto/list-policies.dto';
import { SubmitApprovalRequestDto } from './dto/submit-approval-request.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((e) => e.property);
}

describe('governance, inventory, and audit DTO validation', () => {
  describe('governance DTOs', () => {
    it('accepts a valid nested policy payload and transforms steps', async () => {
      const instance = plainToInstance(CreatePolicyDto, {
        companyId: UUID,
        branchId: UUID,
        entityType: 'expense_entry',
        actionType: 'approve',
        thresholdAmount: 100,
        thresholdPct: 0.1,
        approvalSteps: [{ stepOrder: 1, requiredRole: 'manager', dueHours: 12, allowSelfApproval: false }],
        isEnabled: true,
      });

      expect(instance.approvalSteps[0]).toBeInstanceOf(PolicyStepDto);
      expect(await validate(instance as object)).toEqual([]);
    });

    it('rejects invalid policy thresholds and nested steps', async () => {
      const errors = await validate(
        plainToInstance(CreatePolicyDto, {
          companyId: 'bad',
          entityType: 'expense_entry',
          actionType: 'approve',
          thresholdAmount: -1,
          approvalSteps: [{ stepOrder: 0, requiredPermission: 'x'.repeat(129), dueHours: -1 }],
        }) as object,
      );
      const properties = errors.map((error) => error.property);

      expect(properties).toContain('companyId');
      expect(properties).toContain('thresholdAmount');
      expect(properties).toContain('approvalSteps');
    });

    it('validates partial policy updates', async () => {
      expect(await errorsFor(UpdatePolicyDto, {})).toEqual([]);
      expect(await errorsFor(UpdatePolicyDto, { thresholdPct: -0.01 })).toContain('thresholdPct');
    });

    it('validates create and submit approval request payloads', async () => {
      const base = {
        companyId: UUID,
        branchId: UUID,
        entityType: 'shift',
        entityId: UUID,
        actionType: 'close',
        amount: 1,
        percentage: 0.2,
        reason: 'requires review',
        meta: { source: 'test' },
      };

      expect(await errorsFor(CreateApprovalDto, base)).toEqual([]);
      expect(await errorsFor(SubmitApprovalRequestDto, base)).toEqual([]);
      expect(await errorsFor(CreateApprovalDto, { ...base, amount: -1 })).toContain('amount');
      expect(await errorsFor(SubmitApprovalRequestDto, { ...base, percentage: -1 })).toContain('percentage');
    });

    it('validates approval decisions, list filters, and action reasons', async () => {
      expect(await errorsFor(DecideApprovalStepDto, { decision: 'approve', reason: 'ok' })).toEqual([]);
      expect(await errorsFor(DecideApprovalStepDto, { decision: 'hold' })).toContain('decision');
      expect(await errorsFor(ListApprovalsDto, { companyId: UUID, status: 'submitted' })).toEqual([]);
      expect(await errorsFor(ListApprovalsDto, { status: 'archived' })).toContain('status');
      expect(await errorsFor(ListPoliciesDto, { branchId: UUID, entityType: 'expense' })).toEqual([]);
      expect(await errorsFor(ActionReasonDto, { reason: 'r'.repeat(1025) })).toContain('reason');
    });
  });

  describe('inventory DTOs', () => {
    it('coerces tank dip numeric fields and validates minimums', async () => {
      const instance = plainToInstance(CreateDipDto, {
        branchId: UUID,
        tankId: UUID,
        dipDate: '2026-01-01',
        volume: '2500.5',
        waterLevel: '12',
        temperature: '28.5',
      });

      expect(instance.volume).toBe(2500.5);
      expect(instance.waterLevel).toBe(12);
      expect(await validate(instance as object)).toEqual([]);
      expect(await errorsFor(CreateDipDto, { branchId: UUID, tankId: UUID, dipDate: 'bad', volume: -1 })).toEqual(
        expect.arrayContaining(['dipDate', 'volume']),
      );
    });

    it('validates reconciliation payloads and allowed classifications', async () => {
      const valid = {
        branchId: UUID,
        reconciliationDate: '2026-02-01',
        actualVolume: '1000',
        shiftId: UUID,
        notes: 'monthly check',
        varianceClassification: 'leakage',
      };

      const instance = plainToInstance(CreateReconciliationDto, valid);
      expect(instance.actualVolume).toBe(1000);
      expect(await validate(instance as object)).toEqual([]);
      expect(await errorsFor(CreateReconciliationDto, { ...valid, varianceClassification: 'mystery' })).toContain(
        'varianceClassification',
      );
    });

    it('validates inventory movement query classification length', async () => {
      expect(await errorsFor(InventoryMovementsListQueryDto, { page: '2', pageSize: '10', classification: 'theft' }))
        .toEqual([]);
      expect(await errorsFor(InventoryMovementsListQueryDto, { classification: 'x'.repeat(51) })).toContain(
        'classification',
      );
    });
  });

  describe('audit DTOs', () => {
    it('validates audit filters on top of list query fields', async () => {
      expect(await errorsFor(AuditListQueryDto, { entity: 'expense_entry', action: 'create', actorUserId: UUID }))
        .toEqual([]);
      expect(await errorsFor(AuditListQueryDto, { entity: 'x'.repeat(101), actorUserId: 'bad' })).toEqual(
        expect.arrayContaining(['entity', 'actorUserId']),
      );
    });
  });
});
