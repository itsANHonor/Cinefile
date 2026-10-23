import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * Observer stubs are defined as real classes rather than `vi.fn()` mocks:
 * `vi.restoreAllMocks()` in afterEach strips a mock's implementation, which
 * left `new ResizeObserver()` returning undefined for every test after the
 * first and broke any @dnd-kit component test.
 */
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

class MockResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

/**
 * Re-stub fetch before every test. `vi.restoreAllMocks()` below clears the
 * implementation, so a single top-level stub only survived the first test and
 * left ServerModeContext throwing "Cannot read properties of undefined
 * (reading 'json')" for the rest of each file.
 */
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mode: 'full' }),
    })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
