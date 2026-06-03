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
  // statements 43.50, branches 31.57, lines 44.61, functions 38.40
  // (payables/credit/sales/deliveries/expenses controllers + payables &
  // credit aging/statement services + suppliers & expenses read paths covered).
  // See follow-up task to grow coverage back toward 50%.
  coverageThreshold: {
    global: {
      branches: 29,
      functions: 36,
      lines: 42,
      statements: 41,
    },
  },
};
