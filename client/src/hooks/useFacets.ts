import { useEffect, useState } from 'react';
import { apiService } from '../services/api.service';
import { CollectionFacets } from '../types';

let cache: CollectionFacets | null = null;
let inFlight: Promise<CollectionFacets> | null = null;
const listeners = new Set<() => void>();

export function resetFacetsCache() {
  cache = null;
  inFlight = null;
  listeners.forEach((listener) => listener());
}

export function useFacets() {
  const [facets, setFacets] = useState<CollectionFacets | null>(cache);
  const [isLoading, setIsLoading] = useState(!cache);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const onInvalidate = () => setRefreshTick((t) => t + 1);
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, []);

  useEffect(() => {
    if (cache) {
      setFacets(cache);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    if (!inFlight) {
      inFlight = apiService.getFacets();
    }

    setIsLoading(true);
    inFlight
      .then((data) => {
        cache = data;
        if (!cancelled) {
          setFacets(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return { facets, isLoading, error };
}
