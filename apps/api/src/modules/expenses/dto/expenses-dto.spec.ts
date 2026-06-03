import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExpenseCategoryDto } from './create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './update-expense-category.dto';
import { CreateExpenseEntryDto } from './create-expense-entry.dto';
import { UpdateExpenseEntryDto } from './update-expense-entry.dto';
import { CreatePettyCashTxDto } from './create-petty-cash-tx.dto';
import { RejectExpenseEntryDto } from './reject-expense-entry.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((e) => e.property);
}

describe('expenses DTO validation', () => {
  describe('CreateExpenseCategoryDto', () => {
    const valid = { companyId: UUID, branchId: UUID, code: 'FUEL', name: 'Fuel' };

    it('accepts a minimal valid payload', async () => {
      expect(await errorsFor(CreateExpenseCategoryDto, valid)).toEqual([]);
    });

    it('rejects a non-UUID companyId', async () => {
      expect(await errorsFor(CreateExpenseCategoryDto, { ...valid, companyId: 'nope' })).toContain('companyId');
    });

    it('rejects code over 32 chars', async () => {
      expect(await errorsFor(CreateExpenseCategoryDto, { ...valid, code: 'X'.repeat(33) })).toContain('code');
    });

    it('rejects an invalid status enum value', async () => {
      expect(await errorsFor(CreateExpenseCategoryDto, { ...valid, status: 'archived' })).toContain('status');
    });

    it('accepts active/inactive status', async () => {
      expect(await errorsFor(CreateExpenseCategoryDto, { ...valid, status: 'inactive' })).toEqual([]);
    });

    it('strips HTML tags from the description field', async () => {
      const instance = plainToInstance(CreateExpenseCategoryDto, {
        ...valid,
        description: '<b>Hello</b>',
      });
      expect(instance.description).toBe('Hello');
    });
  });

  describe('UpdateExpenseCategoryDto', () => {
    it('accepts an empty payload (all optional)', async () => {
      expect(await errorsFor(UpdateExpenseCategoryDto, {})).toEqual([]);
    });

    it('still validates provided fields', async () => {
      expect(await errorsFor(UpdateExpenseCategoryDto, { branchId: 'bad' })).toContain('branchId');
    });
  });

  describe('CreateExpenseEntryDto', () => {
    const valid = {
      companyId: UUID,
      branchId: UUID,
      category: 'Ops',
      amount: 25.5,
      vendor: 'Shell',
      paymentMethod: 'cash',
    };

    it('accepts a valid payload', async () => {
      expect(await errorsFor(CreateExpenseEntryDto, valid)).toEqual([]);
    });

    it('coerces a numeric-string amount via @Type', async () => {
      const instance = plainToInstance(CreateExpenseEntryDto, { ...valid, amount: '30.00' });
      expect(typeof instance.amount).toBe('number');
      expect(await validate(instance as object)).toEqual([]);
    });

    it('rejects an amount below the 0.01 minimum', async () => {
      expect(await errorsFor(CreateExpenseEntryDto, { ...valid, amount: 0 })).toContain('amount');
    });

    it('rejects an unknown payment method', async () => {
      expect(await errorsFor(CreateExpenseEntryDto, { ...valid, paymentMethod: 'crypto' })).toContain(
        'paymentMethod',
      );
    });

    it('accepts every allowed payment method', async () => {
      for (const pm of ['petty_cash', 'bank', 'cash', 'card', 'other']) {
        expect(await errorsFor(CreateExpenseEntryDto, { ...valid, paymentMethod: pm })).toEqual([]);
      }
    });

    it('rejects a non-UUID categoryId when provided', async () => {
      expect(await errorsFor(CreateExpenseEntryDto, { ...valid, categoryId: 'x' })).toContain('categoryId');
    });

    it('rejects a vendor over 255 chars', async () => {
      expect(await errorsFor(CreateExpenseEntryDto, { ...valid, vendor: 'V'.repeat(256) })).toContain('vendor');
    });

    it('strips HTML from the description', async () => {
      const instance = plainToInstance(CreateExpenseEntryDto, {
        ...valid,
        description: '<b>bold</b> text',
      });
      expect(instance.description).toBe('bold text');
    });
  });

  describe('UpdateExpenseEntryDto', () => {
    it('accepts an empty payload', async () => {
      expect(await errorsFor(UpdateExpenseEntryDto, {})).toEqual([]);
    });

    it('validates billableDepartment max length when provided', async () => {
      expect(await errorsFor(UpdateExpenseEntryDto, { billableDepartment: 'D'.repeat(129) })).toContain(
        'billableDepartment',
      );
    });

    it('accepts a departmental tag within bounds', async () => {
      expect(await errorsFor(UpdateExpenseEntryDto, { billableDepartment: 'Finance' })).toEqual([]);
    });
  });

  describe('CreatePettyCashTxDto', () => {
    const valid = { companyId: UUID, branchId: UUID, amount: 100, notes: 'top up' };

    it('accepts a valid payload', async () => {
      expect(await errorsFor(CreatePettyCashTxDto, valid)).toEqual([]);
    });

    it('rejects amount below minimum', async () => {
      expect(await errorsFor(CreatePettyCashTxDto, { ...valid, amount: 0 })).toContain('amount');
    });

    it('rejects notes over 512 chars', async () => {
      expect(await errorsFor(CreatePettyCashTxDto, { ...valid, notes: 'n'.repeat(513) })).toContain('notes');
    });

    it('strips HTML from notes before validation', async () => {
      const instance = plainToInstance(CreatePettyCashTxDto, { ...valid, notes: '<i>hi</i>' });
      expect(instance.notes).toBe('hi');
    });
  });

  describe('RejectExpenseEntryDto', () => {
    it('accepts a reason with at least 3 chars', async () => {
      expect(await errorsFor(RejectExpenseEntryDto, { reason: 'no receipt' })).toEqual([]);
    });

    it('rejects a reason under the 3-char minimum', async () => {
      expect(await errorsFor(RejectExpenseEntryDto, { reason: 'no' })).toContain('reason');
    });

    it('rejects a reason over 512 chars', async () => {
      expect(await errorsFor(RejectExpenseEntryDto, { reason: 'r'.repeat(513) })).toContain('reason');
    });

    it('strips HTML before length checks', async () => {
      const instance = plainToInstance(RejectExpenseEntryDto, { reason: '<p>fraudulent</p>' });
      expect(instance.reason).toBe('fraudulent');
    });
  });
});
