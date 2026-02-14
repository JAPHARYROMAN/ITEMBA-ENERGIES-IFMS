import { z } from 'zod';

const boolFromString = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim().toLowerCase())
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined));

export const frontendEnvSchema = z
  .object({
    VITE_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
    VITE_DEMO_MODE: boolFromString,
    DEMO_MODE: boolFromString,
    GEMINI_API_KEY: z.string().min(20).optional(),
  })
  .superRefine((env, ctx) => {
    const demoMode = env.VITE_DEMO_MODE ?? env.DEMO_MODE ?? false;
    const apiBase = env.VITE_API_URL ?? env.NEXT_PUBLIC_API_BASE_URL;

    if (!demoMode && !apiBase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set VITE_API_URL or NEXT_PUBLIC_API_BASE_URL when demo mode is disabled.',
      });
    }
  });

export type FrontendEnv = {
  apiBaseUrl: string;
  demoMode: boolean;
  geminiApiKey?: string;
};

export function parseFrontendEnv(raw: Record<string, string | undefined>): FrontendEnv {
  const parsed = frontendEnvSchema.parse(raw);
  return {
    apiBaseUrl: (parsed.VITE_API_URL ?? parsed.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, ''),
    demoMode: parsed.VITE_DEMO_MODE ?? parsed.DEMO_MODE ?? false,
    geminiApiKey: parsed.GEMINI_API_KEY,
  };
}
