module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverageFrom: ['<rootDir>/src/supplier-utils.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
};
