import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: [
    '**/__tests__/**/*.(spec|test).ts',
    '**/?(*.)+(spec|test).ts'
  ],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/index.ts',
    '!src/**/types.ts',
    '!__tests__/**',
  ],
};

export default config;