import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatMessageDto, ChatRequestDto, ConfirmWriteDto } from './chat.dto';
import { FinancialInsightsDto } from './financial-insights.dto';

async function errorPropsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((error) => error.property);
}

describe('AI DTO validation', () => {
  describe('ChatMessageDto', () => {
    it('accepts valid user and assistant messages', async () => {
      await expect(errorPropsFor(ChatMessageDto, { role: 'user', content: 'hello' })).resolves.toEqual(
        [],
      );
      await expect(
        errorPropsFor(ChatMessageDto, { role: 'assistant', content: 'hello', cards: [] }),
      ).resolves.toEqual([]);
    });

    it('rejects invalid roles and oversized message content', async () => {
      await expect(
        errorPropsFor(ChatMessageDto, { role: 'system', content: 'hello' }),
      ).resolves.toContain('role');
      await expect(
        errorPropsFor(ChatMessageDto, { role: 'user', content: 'x'.repeat(10001) }),
      ).resolves.toContain('content');
    });
  });

  describe('ChatRequestDto', () => {
    it('accepts a minimal chat request and optional history', async () => {
      await expect(errorPropsFor(ChatRequestDto, { message: 'show sales' })).resolves.toEqual([]);
      await expect(
        errorPropsFor(ChatRequestDto, {
          message: 'show sales',
          history: [{ role: 'assistant', content: 'previous answer' }],
          pageContext: '/dashboard',
        }),
      ).resolves.toEqual([]);
    });

    it('rejects oversized message and page context values', async () => {
      await expect(
        errorPropsFor(ChatRequestDto, { message: 'x'.repeat(2001) }),
      ).resolves.toContain('message');
      await expect(
        errorPropsFor(ChatRequestDto, { message: 'ok', pageContext: 'x'.repeat(201) }),
      ).resolves.toContain('pageContext');
    });

    it('validates nested history messages', async () => {
      const instance = plainToInstance(ChatRequestDto, {
        message: 'continue',
        history: [{ role: 'system', content: 'bad' }],
      });

      const errors = await validate(instance);

      expect(errors.map((error) => error.property)).toContain('history');
      expect(errors[0].children?.[0].children?.[0].property).toBe('role');
    });
  });

  describe('ConfirmWriteDto', () => {
    it('accepts every supported confirm action', async () => {
      for (const action of ['create_delivery', 'create_expense', 'record_payment', 'void_sale']) {
        await expect(errorPropsFor(ConfirmWriteDto, { action, payload: {} })).resolves.toEqual([]);
      }
    });

    it('rejects unknown actions and non-object payloads', async () => {
      await expect(
        errorPropsFor(ConfirmWriteDto, { action: 'delete_everything', payload: {} }),
      ).resolves.toContain('action');
      await expect(
        errorPropsFor(ConfirmWriteDto, { action: 'create_expense', payload: 'not-object' }),
      ).resolves.toContain('payload');
    });
  });

  describe('FinancialInsightsDto', () => {
    it('accepts non-empty metrics objects', async () => {
      await expect(
        errorPropsFor(FinancialInsightsDto, { metrics: { totalSales: 50000 } }),
      ).resolves.toEqual([]);
    });

    it('rejects empty and non-object metrics', async () => {
      await expect(errorPropsFor(FinancialInsightsDto, { metrics: {} })).resolves.toContain(
        'metrics',
      );
      await expect(errorPropsFor(FinancialInsightsDto, { metrics: 'bad' })).resolves.toContain(
        'metrics',
      );
    });
  });
});
