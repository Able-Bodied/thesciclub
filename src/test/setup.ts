import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmount between tests.
 *
 * Testing Library registers this itself only when Vitest's `globals` are on.
 * They are not, so without this every `render` stacks another copy of the
 * component in the same document — and a `queryBy…` that should find nothing
 * finds the previous test's markup instead. That fails honest tests and, worse,
 * passes dishonest ones.
 */
afterEach(cleanup);
