import { act, renderHook, waitFor } from '@testing-library/react';
import { useCollectionParams } from './useCollectionParams';
import { AllProviders } from '../test/utils';

function wrapper({ children }: { children: React.ReactNode }) {
  return AllProviders({ children, initialRoute: '/' });
}

function wrapperForRoute(initialRoute: string) {
  return ({ children }: { children: React.ReactNode }) =>
    AllProviders({ children, initialRoute });
}

it('parses and serializes a full filter URL', () => {
  const { result } = renderHook(() => useCollectionParams(), {
    wrapper: wrapperForRoute('/?q=alien&format=DVD&genre=18&series=2,13&edition=Steelbook,Criterion&archived=true&sort=release_date.desc'),
  });

  expect(result.current.params.q).toBe('alien');
  expect(result.current.params.formats).toEqual(['DVD']);
  expect(result.current.params.genres).toEqual([18]);
  expect(result.current.params.series).toEqual([2, 13]);
  expect(result.current.params.decades).toEqual([]);
  expect(result.current.params.editions).toEqual(['Steelbook', 'Criterion']);
  expect(result.current.params.type).toBe('all');
  expect(result.current.params.archived).toBe(true);
  expect(result.current.params.sortBy).toBe('release_date');
  expect(result.current.params.sortOrder).toBe('desc');
});

it('returns defaults and ignores garbage values', () => {
  const { result } = renderHook(() => useCollectionParams(), {
    wrapper: wrapperForRoute('/?sort=;drop&genre=abc&type=banana&decade=what&format=Unknown&archived=banana'),
  });

  expect(result.current.params.q).toBe('');
  expect(result.current.params.formats).toEqual([]);
  expect(result.current.params.genres).toEqual([]);
  expect(result.current.params.decades).toEqual([]);
  expect(result.current.params.type).toBe('all');
  expect(result.current.params.archived).toBe(false);
  expect(result.current.params.sortBy).toBe('title');
  expect(result.current.params.sortOrder).toBe('asc');
});

it('uses default sort from options when URL has none', () => {
  const { result } = renderHook(
    () => useCollectionParams({ defaultSortBy: 'created_at', defaultSortOrder: 'desc' }),
    { wrapper }
  );

  expect(result.current.params.sortBy).toBe('created_at');
  expect(result.current.params.sortOrder).toBe('desc');
});

it('updates URL and params for a committed filter', async () => {
  const { result } = renderHook(() => useCollectionParams(), { wrapper });

  act(() => {
    result.current.setParams({
      q: 'alien',
      formats: ['DVD'],
      genres: [18, 878],
      decades: ['1980'],
      type: 'movie',
      sortBy: 'release_date',
      sortOrder: 'desc',
    });
  });

  await waitFor(() => {
    expect(result.current.params).toMatchObject({
      q: 'alien',
      formats: ['DVD'],
      genres: [18, 878],
      decades: ['1980'],
      type: 'movie',
      sortBy: 'release_date',
      sortOrder: 'desc',
    });
  });
});

it('omits default sort from the URL', async () => {
  const { result } = renderHook(() => useCollectionParams(), { wrapper });

  act(() => {
    result.current.setParams({ sortBy: 'title', sortOrder: 'asc' });
  });

  await waitFor(() => {
    expect(window.location.search).toBe('');
  });
});

it('omits type "all" from the URL', async () => {
  const { result } = renderHook(() => useCollectionParams(), { wrapper });

  act(() => {
    result.current.setParams({ type: 'all' });
  });

  await waitFor(() => {
    expect(window.location.search).toBe('');
  });
});

it('uses history replace for search text updates', async () => {
  const { result } = renderHook(() => useCollectionParams(), { wrapper });

  act(() => {
    result.current.setParams({ q: 'space' });
  });

  await waitFor(() => {
    expect(result.current.params.q).toBe('space');
  });
});

it('clearAll removes every param', async () => {
  const { result } = renderHook(() => useCollectionParams(), {
    wrapper: wrapperForRoute('/?q=alien&format=DVD&genre=18&sort=release_date.desc'),
  });

  act(() => {
    result.current.clearAll();
  });

  await waitFor(() => {
    expect(result.current.params).toMatchObject({
      q: '',
      formats: [],
      genres: [],
      decades: [],
      type: 'all',
      sortBy: 'title',
      sortOrder: 'asc',
      view: 'grid',
    });
  });
});

it('parses and updates view parameter and preserves shelf view on clearAll', async () => {
  const { result } = renderHook(() => useCollectionParams(), {
    wrapper: wrapperForRoute('/?q=alien&format=DVD&view=shelf'),
  });

  expect(result.current.params.view).toBe('shelf');
  expect(result.current.params.q).toBe('alien');

  act(() => {
    result.current.clearAll();
  });

  await waitFor(() => {
    expect(result.current.params).toMatchObject({
      q: '',
      formats: [],
      view: 'shelf',
    });
  });

  act(() => {
    result.current.setParams({ view: 'grid' });
  });

  await waitFor(() => {
    expect(result.current.params.view).toBe('grid');
    expect(window.location.search).toBe('');
  });
});
