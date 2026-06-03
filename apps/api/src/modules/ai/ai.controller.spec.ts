import { AiController } from './ai.controller';
import type { AiChatService } from './ai-chat.service';
import type { AiService } from './ai.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: jest.fn() },
  })),
}));

describe('AiController', () => {
  let aiService: jest.Mocked<Pick<AiService, 'getFinancialInsights'>>;
  let aiChatService: jest.Mocked<Pick<AiChatService, 'chat' | 'getProactiveInsights' | 'confirmWrite'>>;
  let controller: AiController;

  const user = {
    sub: 'user-1',
    email: 'ops@example.com',
    permissions: ['reports:read', 'sales:read'],
  } as any;

  beforeEach(() => {
    aiService = {
      getFinancialInsights: jest.fn(),
    };
    aiChatService = {
      chat: jest.fn(),
      getProactiveInsights: jest.fn(),
      confirmWrite: jest.fn(),
    };
    controller = new AiController(
      aiService as unknown as AiService,
      aiChatService as unknown as AiChatService,
    );
  });

  it('wraps financial insights text from AiService', async () => {
    aiService.getFinancialInsights.mockResolvedValue('Revenue is up.');

    await expect(
      controller.getInsights({ metrics: { revenue: 1000, expenses: 250 } }),
    ).resolves.toEqual({ insights: 'Revenue is up.' });
    expect(aiService.getFinancialInsights).toHaveBeenCalledWith({ revenue: 1000, expenses: 250 });
  });

  it('delegates chat with default empty history and current user context', async () => {
    aiChatService.chat.mockResolvedValue({ role: 'assistant', content: 'Done' });

    await expect(
      controller.chat({ message: 'show sales', pageContext: '/sales' }, user),
    ).resolves.toEqual({ role: 'assistant', content: 'Done' });
    expect(aiChatService.chat).toHaveBeenCalledWith(
      'show sales',
      [],
      { userId: 'user-1', email: 'ops@example.com', permissions: ['reports:read', 'sales:read'] },
      '/sales',
    );
  });

  it('passes provided chat history through unchanged', async () => {
    const history = [{ role: 'user' as const, content: 'previous' }];
    aiChatService.chat.mockResolvedValue({ role: 'assistant', content: 'Next' });

    await controller.chat({ message: 'continue', history }, user);

    expect(aiChatService.chat).toHaveBeenCalledWith(
      'continue',
      history,
      expect.objectContaining({ userId: 'user-1' }),
      undefined,
    );
  });

  it('delegates proactive insights with current user context', async () => {
    aiChatService.getProactiveInsights.mockResolvedValue([
      { type: 'alert', title: 'Low Tank Levels', content: [] },
    ]);

    await expect(controller.getProactiveInsights(user)).resolves.toEqual([
      { type: 'alert', title: 'Low Tank Levels', content: [] },
    ]);
    expect(aiChatService.getProactiveInsights).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'ops@example.com',
      permissions: ['reports:read', 'sales:read'],
    });
  });

  it('delegates confirmed writes with current user context', async () => {
    aiChatService.confirmWrite.mockResolvedValue({
      success: true,
      message: 'created',
      entityId: 'entity-1',
    });

    await expect(
      controller.confirmWrite(
        { action: 'create_expense', payload: { amount: 100, category: 'Fuel' } },
        user,
      ),
    ).resolves.toEqual({ success: true, message: 'created', entityId: 'entity-1' });
    expect(aiChatService.confirmWrite).toHaveBeenCalledWith(
      'create_expense',
      { amount: 100, category: 'Fuel' },
      { userId: 'user-1', email: 'ops@example.com', permissions: ['reports:read', 'sales:read'] },
    );
  });
});
