import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PhysicalFormat, SortField, SortOrder } from '../types';
import { PHYSICAL_FORMATS } from '../lib/formats';

const VALID_SORT_FIELDS: SortField[] = [
  'title',
  'series_sort',
  'director_last_name',
  'release_date',
  'created_at',
  'physical_format',
];

const VALID_ORDERS: SortOrder[] = ['asc', 'desc'];
const VALID_TYPES: Array<'all' | 'movie' | 'tv_season'> = ['all', 'movie', 'tv_season'];

export interface CollectionParams {
  q: string;
  formats: PhysicalFormat[];
  genres: number[];
  decades: string[];
  editions: string[];
  type: 'all' | 'movie' | 'tv_season';
  archived: boolean;
  sortBy: SortField;
  sortOrder: SortOrder;
}

export interface UseCollectionParamsOptions {
  defaultSortBy?: SortField;
  defaultSortOrder?: SortOrder;
}

function parseCommaList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseFormats(raw: string | null): PhysicalFormat[] {
  return parseCommaList(raw).filter((part): part is PhysicalFormat =>
    PHYSICAL_FORMATS.includes(part as PhysicalFormat)
  );
}

function parseGenres(raw: string | null): number[] {
  return parseCommaList(raw)
    .map((part) => Number(part))
    .filter((num) => Number.isInteger(num) && num > 0);
}

function parseDecades(raw: string | null): string[] {
  return parseCommaList(raw).filter((part) => /^\d{4}$/.test(part));
}

function parseType(raw: string | null): 'all' | 'movie' | 'tv_season' {
  if (raw && VALID_TYPES.includes(raw as 'all' | 'movie' | 'tv_season')) {
    return raw as 'all' | 'movie' | 'tv_season';
  }
  return 'all';
}

function parseSort(
  raw: string | null,
  defaultSortBy: SortField,
  defaultSortOrder: SortOrder
): { sortBy: SortField; sortOrder: SortOrder } {
  if (!raw) {
    return { sortBy: defaultSortBy, sortOrder: defaultSortOrder };
  }
  const parts = raw.split('.');
  const sortBy = parts[0] as SortField;
  const sortOrder = (parts[1] as SortOrder) ?? 'asc';
  if (!VALID_SORT_FIELDS.includes(sortBy) || !VALID_ORDERS.includes(sortOrder)) {
    return { sortBy: defaultSortBy, sortOrder: defaultSortOrder };
  }
  return { sortBy, sortOrder };
}

export function useCollectionParams(options: UseCollectionParamsOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultSortBy = options.defaultSortBy ?? 'title';
  const defaultSortOrder = options.defaultSortOrder ?? 'asc';

  const params = useMemo<CollectionParams>(() => {
    return {
      q: searchParams.get('q') ?? '',
      formats: parseFormats(searchParams.get('format')),
      genres: parseGenres(searchParams.get('genre')),
      decades: parseDecades(searchParams.get('decade')),
      editions: parseCommaList(searchParams.get('edition')),
      type: parseType(searchParams.get('type')),
      archived: searchParams.get('archived') === 'true',
      ...parseSort(searchParams.get('sort'), defaultSortBy, defaultSortOrder),
    };
  }, [searchParams, defaultSortBy, defaultSortOrder]);

  const setParams = useCallback(
    (updates: Partial<CollectionParams>) => {
      const next = new URLSearchParams(searchParams);

      if ('q' in updates) {
        const q = updates.q ?? '';
        if (q) next.set('q', q);
        else next.delete('q');
      }

      if ('formats' in updates) {
        const formats = updates.formats ?? [];
        if (formats.length) next.set('format', formats.join(','));
        else next.delete('format');
      }

      if ('genres' in updates) {
        const genres = updates.genres ?? [];
        if (genres.length) next.set('genre', genres.join(','));
        else next.delete('genre');
      }

      if ('decades' in updates) {
        const decades = updates.decades ?? [];
        if (decades.length) next.set('decade', decades.join(','));
        else next.delete('decade');
      }

      if ('editions' in updates) {
        const editions = updates.editions ?? [];
        if (editions.length) next.set('edition', editions.join(','));
        else next.delete('edition');
      }

      if ('type' in updates) {
        const type = updates.type ?? 'all';
        if (type !== 'all') next.set('type', type);
        else next.delete('type');
      }

      if ('archived' in updates) {
        if (updates.archived) next.set('archived', 'true');
        else next.delete('archived');
      }

      if ('sortBy' in updates || 'sortOrder' in updates) {
        const sortBy = updates.sortBy ?? params.sortBy;
        const sortOrder = updates.sortOrder ?? params.sortOrder;
        if (sortBy === defaultSortBy && sortOrder === defaultSortOrder) {
          next.delete('sort');
        } else {
          next.set('sort', `${sortBy}.${sortOrder}`);
        }
      }

      const keys = Object.keys(updates);
      const onlySearch = keys.length === 1 && keys[0] === 'q';
      setSearchParams(next, { replace: onlySearch });
    },
    [searchParams, setSearchParams, params.sortBy, params.sortOrder, defaultSortBy, defaultSortOrder]
  );

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return { params, setParams, clearAll };
}
