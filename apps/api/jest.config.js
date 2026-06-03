module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/database/migrations/**',
    '!src/database/seed.ts',
    '!src/database/reset-admin.ts',
  ],
  // Coverage ratchet: thresholds are pinned just below the CURRENT measured
  // coverage so CI cannot regress. Raise these incrementally as real test
  // coverage improves — never lower them. Measured at the last ratchet:
  // statements 88.6, branches 67.9, lines 92.5, functions 86.0
  // (added branch-focused tests for core/setup services, auth guards,
  // system, middleware, sanitize decorator, notification triggers, exports
  // worker, ai-chat, and many DTO validation paths — 1292 unit tests).
  coverageThreshold: {
    global: {
      branches: 66,
      functions: 84,
      lines: 90,
      statements: 87,
    },
  },
};
