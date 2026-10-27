import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mockApiEngine } from '@/lib/mock-api/engine';

afterEach(() => {
  cleanup();
  mockApiEngine.resetEngine();
});