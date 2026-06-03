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
  // statements 33.74, branches 24.22, lines 34.75, functions 28.65
  // (setup/core/transfers/inventory services + controllers now covered).
  // See follow-up task to grow coverage back toward 50%.
  coverageThreshold: {
    global: {
      branches: 22,
      functions: 26,
      lines: 32,
      statements: 31,
    },
  },
};
