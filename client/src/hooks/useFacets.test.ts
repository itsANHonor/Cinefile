import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFacets, resetFacetsCache } from './useFacets';
import { apiService } from '../services/api.service';

vi.mock('../services/api.service', () => ({
  apiService: {
    getFacets: vi.fn(),
  },
}));

const FACETS = {
  genres: [{ id: 18, name: 'Drama', count: 4 }],
  decades: [{ decade: '1970', count: 2 }],
  formats: [{ format: 'Blu-ray', count: 9 }],
};

describe('useFacets', () => {
  beforeEach(() => {
    resetFacetsCache();
    vi.mocked(apiService.getFacets).mockReset();
  });

  it('fetches and returns facets', async () => {
    vi.mocked(apiService.getFacets).mockResolvedValue(FACETS);

    const { result } = renderHook(() => useFacets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.facets).toEqual(FACETS);
    expect(result.current.error).toBeNull();
  });

  it('shares a single request across concurrent consumers', async () => {
    vi.mocked(apiService.getFacets).mockResolvedValue(FACETS);

    const a = renderHook(() => useFacets());
    const b = renderHook(() => useFacets());

    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    expect(apiService.getFacets).toHaveBeenCalledTimes(1);
  });

  it('serves later consumers from cache without refetching', async () => {
    vi.mocked(apiService.getFacets).mockResolvedValue(FACETS);

    const first = renderHook(() => useFacets());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    const second = renderHook(() => useFacets());
    expect(second.result.current.facets).toEqual(FACETS);
    expect(second.result.current.isLoading).toBe(false);
    expect(apiService.getFacets).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error without throwing when the request fails', async () => {
    vi.mocked(apiService.getFacets).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useFacets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.facets).toBeNull();
  });
});
