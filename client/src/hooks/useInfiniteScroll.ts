import { useCallback, useRef } from 'react';

export function useInfiniteScroll(
  onLoadMore: () => void | Promise<void>,
  { enabled = true, rootMargin = '400px' }: { enabled?: boolean; rootMargin?: string } = {}
) {
  const callbackRef = useRef(onLoadMore);
  callbackRef.current = onLoadMore;

  const isFetchingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const observerRef = useRef<IntersectionObserver | null>(null);

  const setSentinel = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (!entry.isIntersecting) return;
          if (isFetchingRef.current) return;
          if (!enabledRef.current) return;

          isFetchingRef.current = true;
          Promise.resolve(callbackRef.current()).finally(() => {
            isFetchingRef.current = false;
          });
        },
        { rootMargin }
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    [rootMargin]
  );

  return setSentinel;
}
