import fs from 'fs';
import path from 'path';

const SOURCE_ROOT = path.join(process.cwd(), 'src');

function collectSourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'database' || entry.name === 'node_modules') return [];
        return collectSourceFiles(fullPath);
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
      return [fullPath];
    });
}

function isDecoratedSource(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (
    normalized.endsWith('/main.ts') ||
    normalized.endsWith('.module.ts') ||
    normalized.includes('/database/migrations/') ||
    normalized.endsWith('/database/seed.ts') ||
    normalized.endsWith('/database/reset-admin.ts') ||
    normalized.endsWith('/database/migrate.ts')
  ) {
    return false;
  }

  const isDto =
    normalized.includes('/dto/') ||
    normalized.includes('/common/dto/') ||
    normalized.endsWith('/common/dto/index.ts');
  if (!isDto) return false;

  const source = fs.readFileSync(filePath, 'utf8');
  return /@(Api|Body|Catch|Controller|Cron|Get|Inject|Injectable|Is|Message|Param|Post|Put|Patch|Delete|Query|Use|WebSocket|Subscribe)/.test(
    source,
  );
}

function decoratedSources(): string[] {
  return collectSourceFiles(SOURCE_ROOT).filter(isDecoratedSource).sort();
}

function withPatchedReflect(
  patch: (reflect: Record<string, unknown>) => void,
  run: () => void,
): void {
  const reflect = Reflect as unknown as Record<string, unknown>;
  const decorateDescriptor = Object.getOwnPropertyDescriptor(Reflect, 'decorate');
  const metadataDescriptor = Object.getOwnPropertyDescriptor(Reflect, 'metadata');

  try {
    patch(reflect);
    jest.resetModules();
    jest.isolateModules(run);
  } finally {
    if (decorateDescriptor) {
      Object.defineProperty(Reflect, 'decorate', decorateDescriptor);
    } else {
      delete reflect.decorate;
    }
    if (metadataDescriptor) {
      Object.defineProperty(Reflect, 'metadata', metadataDescriptor);
    } else {
      delete reflect.metadata;
    }
    jest.resetModules();
  }
}

function importAll(files: string[]): void {
  for (const file of files) {
    jest.requireActual(file);
  }
}

describe('decorated source TypeScript helper branches', () => {
  const files = decoratedSources();

  it('discovers decorated backend sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('loads decorated sources when Reflect.decorate is unavailable', () => {
    withPatchedReflect(
      (reflect) => {
        delete reflect.decorate;
      },
      () => importAll(files),
    );
  });

  it('loads decorated sources when Reflect.metadata is unavailable', () => {
    withPatchedReflect(
      (reflect) => {
        delete reflect.metadata;
      },
      () => importAll(files),
    );
  });

  it('loads decorated sources through the manual decorator helper without metadata decorators', () => {
    withPatchedReflect(
      (reflect) => {
        delete reflect.decorate;
        delete reflect.metadata;
      },
      () => importAll(files),
    );
  });
});
