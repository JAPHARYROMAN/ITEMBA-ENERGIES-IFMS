import { parseFrontendEnv, type FrontendEnv } from './env-schema';

type EnvRecord = Record<string, string | undefined>;

const envRaw = ((import.meta as ImportMeta & { env: EnvRecord }).env ?? {}) as EnvRecord;

export const frontendEnv: FrontendEnv = parseFrontendEnv(envRaw);
