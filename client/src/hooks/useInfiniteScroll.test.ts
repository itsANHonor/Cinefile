import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInfiniteScroll } from './useInfiniteScroll';

type Trigger = (entries: Array<{ isIntersecting: boolean }>) => void;

let triggers: Trigger[] = [];
let observed: Element[] = [];
let disconnectCount = 0;

beforeEach(() => {
  triggers = [];
  observed = [];
  disconnectCount = 0;

  globalThis.IntersectionObserver = vi.fn().mockImplementation((cb: Trigger) => {
    triggers.push(cb);
    return {
      observe: (node: Element) => observed.push(node),
      unobserve: vi.fn(),
      disconnect: () => {
        disconnectCount += 1;
      },
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: () => [],
    };
  }) as unknown as typeof IntersectionObserver;
});

function attach(setSentinel: (n: HTMLElement | null) => void) {
  const node = document.createElement('div');
  setSentinel(node);
  return node;
}

describe('useInfiniteScroll', () => {
  it('calls onLoadMore when the sentinel intersects', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll(onLoadMore, { enabled: true }));

    attach(result.current);
    triggers[0]([{ isIntersecting: true }]);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not call onLoadMore when the sentinel is not intersecting', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll(onLoadMore, { enabled: true }));

    attach(result.current);
    triggers[0]([{ isIntersecting: false }]);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not call onLoadMore when disabled', () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll(onLoadMore, { enabled: false }));

    attach(result.current);
    triggers[0]([{ isIntersecting: true }]);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not re-enter while a load is still in flight', async () => {
    let resolve: () => void = () => {};
    const onLoadMore = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const { result } = renderHook(() => useInfiniteScroll(onLoadMore, { enabled: true }));

    attach(result.current);
    triggers[0]([{ isIntersecting: true }]);
    triggers[0]([{ isIntersecting: true }]);

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    resolve();
    await new Promise((r) => setTimeout(r, 0));

    triggers[0]([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('observes the sentinel node and disconnects when it is detached', () => {
    const { result } = renderHook(() => useInfiniteScroll(vi.fn(), { enabled: true }));

    const node = attach(result.current);
    expect(observed).toContain(node);

    result.current(null);
    expect(disconnectCount).toBe(1);
  });
});
