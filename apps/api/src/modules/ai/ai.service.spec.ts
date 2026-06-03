import { Logger } from '@nestjs/common';
import { AiService } from './ai.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: jest.fn() },
  })),
}));

describe('AiService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns an unavailable message when Gemini is not configured', async () => {
    const service = new AiService({ get: jest.fn().mockReturnValue(undefined) } as any);

    await expect(service.getFinancialInsights({ revenue: 1000 })).resolves.toContain(
      'GEMINI_API_KEY not configured',
    );
    expect(warnSpy.mock.calls[0][0]).toContain('GEMINI_API_KEY not set');
  });

  it('formats metrics into the Gemini prompt and returns generated text', async () => {
    const service = new AiService({ get: jest.fn().mockReturnValue(undefined) } as any);
    const generateContent = jest.fn().mockResolvedValue({ text: 'Watch expense growth.' });
    (service as any).client = { models: { generateContent } };

    await expect(
      service.getFinancialInsights({ revenue: 1000, expenses: 450 }),
    ).resolves.toBe('Watch expense growth.');
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-1.5-flash',
      contents: expect.stringContaining('"expenses": 450'),
    });
  });

  it('returns a fallback when Gemini does not provide text', async () => {
    const service = new AiService({ get: jest.fn().mockReturnValue(undefined) } as any);
    (service as any).client = { models: { generateContent: jest.fn().mockResolvedValue({}) } };

    await expect(service.getFinancialInsights({ revenue: 1000 })).resolves.toBe(
      'No insights generated.',
    );
  });
});
