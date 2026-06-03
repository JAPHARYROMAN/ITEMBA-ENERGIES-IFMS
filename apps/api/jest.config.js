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
  // statements 83.46, branches 61.35, lines 86.89, functions 82.83
  // (deep service/controller/DTO coverage across auth, AI, notifications,
  // exports, reports, admin, common support, sales, expenses, credit,
  // payables, deliveries, transfers, shifts, governance, inventory, audit —
  // 989 unit/integration tests).
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 81,
      lines: 85,
      statements: 82,
    },
  },
};
