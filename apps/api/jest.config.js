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
  // statements 61.33, branches 45.79, lines 63.77, functions 56.69
  // (deep service coverage across sales, expenses, credit, payables,
  // deliveries, transfers, reports, shifts, governance, notifications,
  // inventory, audit — 739 unit tests).
  coverageThreshold: {
    global: {
      branches: 43,
      functions: 54,
      lines: 61,
      statements: 59,
    },
  },
};
