/** Component/unit tests run in jsdom with mocked fetch. Real-API tests live in tests/*.integration.test.ts
 *  and only run when INVENTORY_E2E_API_URL is set (see e2e/run-e2e.mjs). */
module.exports = {
  testEnvironment: '<rootDir>/tests/jsdom-env.cjs',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
  coverageDirectory: '<rootDir>/coverage',
};
