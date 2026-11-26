import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HistoryCategory,
  HistoryEntry,
  HistoryFeedResponse,
  HistoryItemDetail,
  PhysicalFormat,
} from '../types';
import { apiService } from '../services/api.service';
import { formatBadgeClasses, formatLabels, isPhysicalFormat } from '../lib/formats';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Sheet } from '../components/ui/Sheet';
import { Skeleton } from '../components/ui/Skeleton';

const VALID_CATEGORIES: HistoryCategory[] = ['all', 'items', 'shelves', 'archived'];
const PAGE_SIZE = 50;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function parseUtcDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00Z`);
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatMonthYear(raw: string): string {
  const date = parseUtcDate(raw);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatShortDate(raw: string): string {
  const date = parseUtcDate(raw);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

interface DeleteIconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const DeleteHistoryButton: React.FC<DeleteIconButtonProps> = ({ label, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[--radius-control] text-content-muted transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-red-950/40 dark:hover:text-red-400 disabled:opacity-50"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  </button>
);

interface PosterThumbProps {
  url: string | null;
  alt: string;
  size?: 'md' | 'sm';
}

const PosterThumb: React.FC<PosterThumbProps> = ({ url, alt, size = 'md' }) => {
  const [imgError, setImgError] = useState(false);
  const dims = size === 'sm' ? 'h-12 w-8' : 'h-16 w-11';

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setImgError(true)}
        className={`${dims} flex-shrink-0 rounded-[4px] object-cover border border-subtle bg-surface-sunken`}
      />
    );
  }

  return (
    <div
      className={`${dims} flex flex-shrink-0 items-center justify-center rounded-[4px] border border-subtle bg-surface-sunken text-content-muted`}
      aria-hidden="true"
    >
      <svg className="h-5 w-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth={1.75} />
        <path strokeLinecap="round" strokeWidth={1.75} d="M7 3v18M17 3v18M3 12h18" />
      </svg>
    </div>
  );
};

interface HistoryItemRowProps {
  item: HistoryItemDetail;
  dateLabel?: string;
  secondaryDateLabel?: string | null;
  canEdit: boolean;
  isDeleting: boolean;
  deleteLabel: string;
  onDelete: () => void;
  variant?: 'added' | 'archived';
}

const HistoryItemRow: React.FC<HistoryItemRowProps> = ({
  item,
  dateLabel,
  secondaryDateLabel,
  canEdit,
  isDeleting,
  deleteLabel,
  onDelete,
  variant = 'added',
}) => {
  const itemHref = item.archived
    ? canEdit
      ? `/?archived=true&search=${encodeURIComponent(item.name)}`
      : null
    : `/?search=${encodeURIComponent(item.name)}`;

  const showIncludedTitles =
    item.mediaTitles.length > 1 ||
    (item.mediaTitles.length === 1 &&
      item.mediaTitles[0].title.toLowerCase() !== item.name.toLowerCase());

  return (
    <div className="flex items-start gap-3.5">
      <PosterThumb url={item.coverArtUrl} alt={item.name} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {itemHref ? (
                <Link
                  to={itemHref}
                  className="text-sm sm:text-base font-semibold text-content hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  {item.name}
                </Link>
              ) : (
                <span className="text-sm sm:text-base font-semibold text-content">{item.name}</span>
              )}

              {variant === 'archived' && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Archived
                </span>
              )}

              {variant === 'added' && item.isUpgrade && (
                <span
                  className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                  title={
                    item.previousFormats && item.previousFormats.length > 0
                      ? `Previously owned on ${item.previousFormats.join(', ')}`
                      : 'Additional edition of an owned title'
                  }
                >
                  {item.previousFormats && item.previousFormats.length > 0
                    ? `Upgrade from ${item.previousFormats.join(', ')}`
                    : 'Format Upgrade'}
                </span>
              )}
            </div>

            {showIncludedTitles && (
              <p className="mt-0.5 text-xs text-content-muted line-clamp-1">
                {item.mediaTitles
                  .map((m) => (m.year ? `${m.title} (${m.year})` : m.title))
                  .join(' · ')}
              </p>
            )}

            {variant === 'archived' && item.archiveReason && (
              <p className="mt-1 text-xs text-content-muted">
                Reason: <span className="font-medium text-content">{item.archiveReason}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {dateLabel && (
              <div className="text-right">
                <span className="block text-xs font-medium text-content-muted whitespace-nowrap">
                  {dateLabel}
                </span>
                {secondaryDateLabel && (
                  <span className="block text-[11px] text-content-muted/80 whitespace-nowrap">
                    {secondaryDateLabel}
                  </span>
                )}
              </div>
            )}
            {canEdit && (
              <DeleteHistoryButton
                label={deleteLabel}
                onClick={onDelete}
                disabled={isDeleting}
              />
            )}
          </div>
        </div>

        {/* Formats, Editions, and Store/Cost Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.formats.map((fmt) => {
            const label = isPhysicalFormat(fmt) ? formatLabels[fmt as PhysicalFormat] : fmt;
            return (
              <span
                key={fmt}
                className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
                  formatBadgeClasses[fmt] ??
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                }`}
              >
                {label}
              </span>
            );
          })}

          {item.editionTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full border border-subtle bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-content"
            >
              {tag}
            </span>
          ))}

          {(item.storeName || (item.cost != null && item.cost > 0)) && (
            <span className="ml-1 text-xs text-content-muted">
              {[
                item.storeName,
                item.cost != null && item.cost > 0 ? formatCurrency(item.cost) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const HistoryPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  const canEdit = isAuthenticated && !isReadOnly;
  const confirm = useConfirm();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialCategory = VALID_CATEGORIES.includes(
    searchParams.get('category') as HistoryCategory
  )
    ? (searchParams.get('category') as HistoryCategory)
    : 'all';
  const initialBasis = searchParams.get('basis') === 'purchased' ? 'purchased' : 'added';

  const [category, setCategory] = useState<HistoryCategory>(initialCategory);
  const [dateBasis, setDateBasis] = useState<'added' | 'purchased'>(initialBasis);
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');

  const [feed, setFeed] = useState<HistoryFeedResponse | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyBlock, setPrivacyBlock] = useState<'collection' | 'history' | null>(null);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [activePhoto, setActivePhoto] = useState<HistoryEntry['photo'] | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const updateUrlParams = useCallback(
    (nextCat: HistoryCategory, nextBasis: 'added' | 'purchased', nextQ: string) => {
      const next = new URLSearchParams();
      if (nextCat !== 'all') next.set('category', nextCat);
      if (nextBasis !== 'added') next.set('basis', nextBasis);
      if (nextQ) next.set('q', nextQ);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPrivacyBlock(null);
    try {
      const data = await apiService.getHistory({
        category,
        date_basis: dateBasis,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setFeed(data);
      setEntries(data.entries);
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      if (status === 403 && body?.collection_public === false) {
        setPrivacyBlock('collection');
      } else if (status === 403 && body?.history_public === false) {
        setPrivacyBlock('history');
      } else {
        console.error('Failed to load collection history:', err);
        setError('Could not load collection history. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [category, dateBasis, debouncedSearch]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleLoadMore = async () => {
    if (!feed || !feed.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const more = await apiService.getHistory({
        category,
        date_basis: dateBasis,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: entries.length,
      });
      setFeed(more);
      setEntries((prev) => [...prev, ...more.entries]);
    } catch (err) {
      console.error('Failed to load more history:', err);
      toast({ message: 'Failed to load older history entries.', type: 'error' });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleExpanded = (entryKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) {
        next.delete(entryKey);
      } else {
        next.add(entryKey);
      }
      return next;
    });
  };

  const handleDeleteEvents = async (ids: number[], description: string) => {
    const confirmed = await confirm({
      title: 'Remove from History?',
      message: `Remove "${description}" from your History timeline? This only deletes the timeline entry and will not delete any items, shelves, or photos from your collection.`,
      confirmLabel: 'Remove from History',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });

    try {
      await apiService.deleteHistoryEvents(ids);
      const removedSet = new Set(ids);

      setEntries((prev) =>
        prev
          .map((entry): HistoryEntry | null => {
            const remainingEventIds = entry.eventIds.filter((id) => !removedSet.has(id));
            if (remainingEventIds.length === 0) {
              return null;
            }
            const nextItems = entry.items?.filter((it) => !removedSet.has(it.eventId));
            const nextShelves = entry.shelves?.filter((sh) => !removedSet.has(sh.eventId));
            return {
              ...entry,
              eventIds: remainingEventIds,
              items: nextItems,
              shelves: nextShelves,
              title:
                nextItems && nextItems.length === 1
                  ? nextItems[0].name
                  : nextItems && nextItems.length > 1
                    ? `Added ${nextItems.length} items to collection`
                    : nextShelves && nextShelves.length === 1 && entry.eventType === 'shelf_added'
                      ? `Added shelf "${nextShelves[0].shelfName}"`
                      : nextShelves && nextShelves.length > 1
                        ? `Added ${nextShelves.length} shelves to ${nextShelves[0].groupName}`
                        : entry.title,
            };
          })
          .filter((entry): entry is HistoryEntry => entry !== null)
      );

      toast({
        message:
          ids.length === 1
            ? 'Removed entry from History.'
            : `Removed ${ids.length} entries from History.`,
        type: 'success',
      });

      // Refresh counts quietly in background
      apiService
        .getHistory({
          category,
          date_basis: dateBasis,
          search: debouncedSearch || undefined,
          limit: Math.max(PAGE_SIZE, entries.length),
          offset: 0,
        })
        .then((updated) => {
          setFeed(updated);
          setEntries(updated.entries);
        })
        .catch(() => {});
    } catch (err) {
      console.error('Failed to delete history events:', err);
      toast({ message: 'Failed to remove entry from History.', type: 'error' });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const groupedByMonth = useMemo(() => {
    const groups: Array<{ monthLabel: string; items: HistoryEntry[] }> = [];
    for (const entry of entries) {
      const label = formatMonthYear(entry.effectiveDate);
      const last = groups[groups.length - 1];
      if (last && last.monthLabel === label) {
        last.items.push(entry);
      } else {
        groups.push({ monthLabel: label, items: [entry] });
      }
    }
    return groups;
  }, [entries]);

  if (isLoading && !feed) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8 space-y-6" aria-busy="true">
        <div>
          <Skeleton className="h-8 w-44 rounded-[--radius-control] mb-2" />
          <Skeleton className="h-4 w-80 rounded-[--radius-control]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[--radius-card]" />
          ))}
        </div>
      </div>
    );
  }

  if (privacyBlock && !canEdit) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <EmptyState
          title={
            privacyBlock === 'collection'
              ? 'This collection is private'
              : 'Collection history is private'
          }
          description={
            privacyBlock === 'collection'
              ? 'The owner has set this media collection to private.'
              : 'The owner has restricted the collection history timeline to Admin access.'
          }
          action={
            !isReadOnly ? (
              <Button asChild>
                <Link to="/admin">Sign in as Admin</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/">Back to Collection</Link>
              </Button>
            )
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          }
        />
      </div>
    );
  }

  if (error || !feed) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <EmptyState
          title="Couldn’t load history"
          description={error || 'Collection history is currently unavailable.'}
          action={
            <Button onClick={loadHistory} variant="secondary">
              Try again
            </Button>
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>
    );
  }

  const categoryButtons: Array<{ value: HistoryCategory; label: string; count: number }> = [
    { value: 'all', label: 'All Changes', count: feed.counts.all },
    { value: 'items', label: 'Items Added', count: feed.counts.items },
    { value: 'shelves', label: 'Shelves & Setup', count: feed.counts.shelves },
    { value: 'archived', label: 'Archived', count: feed.counts.archived },
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8 space-y-6">
      {/* Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content sm:text-3xl">History</h1>
          <p className="mt-1 text-sm text-content-muted">
            How your physical collection and shelf setup have evolved over time.
          </p>
        </div>
        <SegmentedControl
          name="History date basis"
          value={dateBasis}
          onChange={(val) => {
            const nextBasis = val as 'added' | 'purchased';
            setDateBasis(nextBasis);
            updateUrlParams(category, nextBasis, debouncedSearch);
          }}
          options={[
            { value: 'added', label: 'By Date Added' },
            {
              value: 'purchased',
              label: 'By Purchase Date',
              disabled: feed.itemsWithPurchaseDate === 0,
            },
          ]}
        />
      </header>

      {/* Filter Pills & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-subtle pb-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter history by type">
          {categoryButtons.map((btn) => {
            const isSelected = category === btn.value;
            return (
              <button
                key={btn.value}
                type="button"
                onClick={() => {
                  setCategory(btn.value);
                  updateUrlParams(btn.value, dateBasis, debouncedSearch);
                }}
                aria-pressed={isSelected}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-surface-sunken text-content-muted hover:text-content border border-subtle'
                }`}
              >
                <span>{btn.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-surface text-content-muted'
                  }`}
                >
                  {btn.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => {
              const nextVal = e.target.value;
              setSearchInput(nextVal);
              updateUrlParams(category, dateBasis, nextVal.trim());
            }}
            placeholder="Filter history…"
            aria-label="Filter history"
            className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-1.5 text-sm text-content placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Empty State */}
      {entries.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch || category !== 'all'
              ? 'No matching history entries'
              : 'No collection history yet'
          }
          description={
            debouncedSearch || category !== 'all'
              ? 'Try clearing your filter or search query to view all recorded changes.'
              : 'Additions to your collection, shelf setup changes, and archived items will appear here chronologically.'
          }
          action={
            debouncedSearch || category !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setCategory('all');
                  setSearchInput('');
                  setDebouncedSearch('');
                  updateUrlParams('all', dateBasis, '');
                }}
              >
                Clear filters
              </Button>
            ) : canEdit ? (
              <Button asChild>
                <Link to="/admin">Add an item</Link>
              </Button>
            ) : undefined
          }
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      ) : (
        <div className="space-y-8">
          {groupedByMonth.map((group) => (
            <section key={group.monthLabel} aria-label={group.monthLabel} className="space-y-4">
              <div className="sticky top-16 z-10 -mx-1 bg-surface/95 px-1 py-1.5 backdrop-blur">
                <h2 className="text-xs font-bold uppercase tracking-wider text-content-muted">
                  {group.monthLabel}
                </h2>
              </div>

              <ol className="relative ml-3 border-l-2 border-subtle space-y-4 pl-6">
                {group.items.map((entry) => {
                  const isExpanded = expandedKeys.has(entry.entryKey);
                  const isEntryDeleting = entry.eventIds.some((id) => deletingIds.has(id));
                  const primaryDate = formatShortDate(entry.effectiveDate);

                  // ── 1. ITEM ADDED (Single or Collapsible Bulk) ───────────────
                  if (entry.eventType === 'item_added' && entry.items && entry.items.length > 0) {
                    const items = entry.items;

                    if (items.length === 1) {
                      const single = items[0];
                      const secondaryDate =
                        dateBasis === 'added' && single.purchaseDate
                          ? `Purchased ${formatShortDate(single.purchaseDate)}`
                          : dateBasis === 'purchased' && single.purchaseDate
                            ? `Added ${formatShortDate(single.occurredAt)}`
                            : null;

                      return (
                        <li key={entry.entryKey} className="relative">
                          <span
                            className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 ring-4 ring-surface dark:bg-primary-500"
                            aria-hidden="true"
                          />
                          <div className="card p-4">
                            <HistoryItemRow
                              item={single}
                              dateLabel={primaryDate}
                              secondaryDateLabel={secondaryDate}
                              canEdit={canEdit}
                              isDeleting={isEntryDeleting}
                              deleteLabel={`Remove "${single.name}" from history`}
                              onDelete={() =>
                                handleDeleteEvents([single.eventId], single.name)
                              }
                            />
                          </div>
                        </li>
                      );
                    }

                    // Multi-item addition: same item-card silhouette when collapsed, expandable into standard item rows
                    const previewPosters = items
                      .map((it) => ({ key: it.eventId, url: it.coverArtUrl, name: it.name }))
                      .slice(0, 3);
                    const uniqueFormats = Array.from(
                      new Set(items.flatMap((it) => it.formats))
                    );
                    const previewNames = items.slice(0, 3).map((it) => it.name);
                    const remainingCount = Math.max(0, items.length - previewNames.length);

                    return (
                      <li key={entry.entryKey} className="relative">
                        <span
                          className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 ring-4 ring-surface dark:bg-primary-500"
                          aria-hidden="true"
                        />
                        <div className="card p-4 space-y-3">
                          <div className="flex items-start gap-3.5">
                            {/* Stacked Poster Strip matching single-item poster footprint */}
                            <div className="flex -space-x-4 flex-shrink-0">
                              {previewPosters.map((p) => (
                                <PosterThumb key={p.key} url={p.url} alt={p.name} />
                              ))}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(entry.entryKey)}
                                    aria-expanded={isExpanded}
                                    className="group inline-flex items-center gap-2 text-left text-sm sm:text-base font-semibold text-content hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                  >
                                    <span>Added {items.length} items</span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken border border-subtle px-2 py-0.5 text-xs font-medium text-content-muted group-hover:border-primary-400 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                                      {isExpanded ? 'Hide list' : `Show all ${items.length}`}
                                      <svg
                                        className={`h-3.5 w-3.5 transition-transform ${
                                          isExpanded ? 'rotate-180' : ''
                                        }`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 9l-7 7-7-7"
                                        />
                                      </svg>
                                    </span>
                                  </button>

                                  {!isExpanded && (
                                    <p className="mt-0.5 text-xs text-content-muted line-clamp-1">
                                      {previewNames.join(', ')}
                                      {remainingCount > 0 ? ` +${remainingCount} more` : ''}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs font-medium text-content-muted whitespace-nowrap">
                                    {primaryDate}
                                  </span>
                                  {canEdit && (
                                    <DeleteHistoryButton
                                      label={`Remove batch of ${items.length} items from history`}
                                      onClick={() =>
                                        handleDeleteEvents(
                                          entry.eventIds,
                                          `Added ${items.length} items`
                                        )
                                      }
                                      disabled={isEntryDeleting}
                                    />
                                  )}
                                </div>
                              </div>

                              {!isExpanded && uniqueFormats.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {uniqueFormats.map((fmt) => {
                                    const label = isPhysicalFormat(fmt)
                                      ? formatLabels[fmt as PhysicalFormat]
                                      : fmt;
                                    return (
                                      <span
                                        key={fmt}
                                        className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
                                          formatBadgeClasses[fmt] ??
                                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                        }`}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="divide-y divide-subtle border-t border-subtle pt-3 space-y-3">
                              {items.map((item, idx) => (
                                <div key={item.eventId} className={idx > 0 ? 'pt-3' : ''}>
                                  <HistoryItemRow
                                    item={item}
                                    dateLabel={
                                      item.purchaseDate
                                        ? `Purchased ${formatShortDate(item.purchaseDate)}`
                                        : undefined
                                    }
                                    canEdit={canEdit}
                                    isDeleting={deletingIds.has(item.eventId)}
                                    deleteLabel={`Remove "${item.name}" from history`}
                                    onDelete={() =>
                                      handleDeleteEvents([item.eventId], item.name)
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  }

                  // ── 2. ITEM ARCHIVED ─────────────────────────────────────────
                  if (entry.eventType === 'item_archived' && entry.items && entry.items[0]) {
                    const archivedItem = entry.items[0];
                    return (
                      <li key={entry.entryKey} className="relative">
                        <span
                          className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-4 ring-surface"
                          aria-hidden="true"
                        />
                        <div className="card p-4">
                          <HistoryItemRow
                            item={archivedItem}
                            variant="archived"
                            dateLabel={primaryDate}
                            canEdit={canEdit}
                            isDeleting={isEntryDeleting}
                            deleteLabel={`Remove archived event for "${archivedItem.name}" from history`}
                            onDelete={() =>
                              handleDeleteEvents(entry.eventIds, archivedItem.name)
                            }
                          />
                        </div>
                      </li>
                    );
                  }

                  // ── 3. SHELF GROUP / SHELF ADDED / RESIZED ───────────────────
                  if (
                    (entry.eventType === 'shelf_group_added' ||
                      entry.eventType === 'shelf_added' ||
                      entry.eventType === 'shelf_resized') &&
                    entry.shelves &&
                    entry.shelves.length > 0
                  ) {
                    const shelves = entry.shelves;
                    const isBulkShelves = shelves.length > 1;
                    const totalCapacity = shelves.reduce(
                      (sum, s) => sum + (s.capacityUnits || 0),
                      0
                    );

                    return (
                      <li key={entry.entryKey} className="relative">
                        <span
                          className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 ring-4 ring-surface dark:bg-teal-500"
                          aria-hidden="true"
                        />
                        <div className="card p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[--radius-control] bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                                aria-hidden="true"
                              >
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth={2} />
                                  <path strokeWidth={2} d="M3 9h18M3 15h18" />
                                </svg>
                              </div>

                              <div className="min-w-0">
                                {isBulkShelves ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(entry.entryKey)}
                                    aria-expanded={isExpanded}
                                    className="group inline-flex flex-wrap items-center gap-2 text-left text-sm sm:text-base font-semibold text-content hover:text-primary-600 dark:hover:text-primary-400"
                                  >
                                    <span>{entry.title}</span>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken border border-subtle px-2 py-0.5 text-xs font-medium text-content-muted">
                                      {isExpanded ? 'Hide shelves' : `Show ${shelves.length} shelves`}
                                    </span>
                                  </button>
                                ) : (
                                  <Link
                                    to="/?view=shelf"
                                    className="text-sm sm:text-base font-semibold text-content hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                  >
                                    {entry.title}
                                  </Link>
                                )}

                                <p className="mt-0.5 text-xs text-content-muted">
                                  {entry.eventType === 'shelf_group_added' &&
                                    'New shelf unit added to physical library'}
                                  {entry.eventType === 'shelf_added' &&
                                    (isBulkShelves
                                      ? `${totalCapacity} total case units across ${shelves.length} shelves`
                                      : `${shelves[0].groupName}${
                                          shelves[0].capacityUnits
                                            ? ` · ${shelves[0].capacityUnits} case capacity`
                                            : ''
                                        }`)}
                                  {entry.eventType === 'shelf_resized' &&
                                    `${shelves[0].groupName} · ${
                                      shelves[0].previousCapacityUnits ?? '?'
                                    } → ${shelves[0].capacityUnits ?? '?'} case units`}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs font-medium text-content-muted whitespace-nowrap">
                                {primaryDate}
                              </span>
                              {canEdit && (
                                <DeleteHistoryButton
                                  label={`Remove "${entry.title}" from history`}
                                  onClick={() => handleDeleteEvents(entry.eventIds, entry.title)}
                                  disabled={isEntryDeleting}
                                />
                              )}
                            </div>
                          </div>

                          {isBulkShelves && isExpanded && (
                            <div className="divide-y divide-subtle border-t border-subtle pt-2.5 text-sm">
                              {shelves.map((sh) => (
                                <div
                                  key={sh.eventId}
                                  className="flex items-center justify-between py-1.5"
                                >
                                  <span className="text-content font-medium">
                                    {sh.shelfName || sh.groupName}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {sh.capacityUnits != null && (
                                      <span className="text-xs text-content-muted">
                                        {sh.capacityUnits} units
                                      </span>
                                    )}
                                    {canEdit && (
                                      <DeleteHistoryButton
                                        label={`Remove "${sh.shelfName}" from history`}
                                        onClick={() =>
                                          handleDeleteEvents(
                                            [sh.eventId],
                                            sh.shelfName || entry.title
                                          )
                                        }
                                        disabled={deletingIds.has(sh.eventId)}
                                      />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  }

                  // ── 4. SHELF PHOTO UPLOADED ──────────────────────────────────
                  if (entry.eventType === 'shelf_photo_added' && entry.photo) {
                    const photo = entry.photo;
                    return (
                      <li key={entry.entryKey} className="relative">
                        <span
                          className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 ring-4 ring-surface dark:bg-purple-500"
                          aria-hidden="true"
                        />
                        <div className="card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => setActivePhoto(photo)}
                                className="group relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-[--radius-control] border border-subtle bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Preview shelf photo: ${entry.title}`}
                              >
                                <img
                                  src={photo.imageUrl}
                                  alt={photo.caption || 'Shelf setup photo'}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              </button>

                              <div className="min-w-0">
                                <span className="block text-sm sm:text-base font-semibold text-content">
                                  {photo.caption || 'Added shelf photo'}
                                </span>
                                <p className="mt-0.5 text-xs text-content-muted">
                                  {[photo.groupName || 'Full Setup', photo.shelfName]
                                    .filter(Boolean)
                                    .join(' / ')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs font-medium text-content-muted whitespace-nowrap">
                                {primaryDate}
                              </span>
                              {canEdit && (
                                <DeleteHistoryButton
                                  label={`Remove photo event "${entry.title}" from history`}
                                  onClick={() => handleDeleteEvents(entry.eventIds, entry.title)}
                                  disabled={isEntryDeleting}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  // ── 5. SHELF REORGANIZATION / SHELVING QUEUE ─────────────────
                  return (
                    <li key={entry.entryKey} className="relative">
                      <span
                        className="absolute -left-[33px] top-4 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 ring-4 ring-surface dark:bg-teal-500"
                        aria-hidden="true"
                      />
                      <div className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[--radius-control] bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                              aria-hidden="true"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 6h16M4 12h16M4 18h10"
                                />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <Link
                                to="/?view=shelf"
                                className="text-sm sm:text-base font-semibold text-content hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                              >
                                {entry.title}
                              </Link>
                              <p className="mt-0.5 text-xs text-content-muted">
                                {entry.reorganization?.mode === 'shelving_queue'
                                  ? 'Placed unassigned items onto shelves via Shelving Queue'
                                  : entry.reorganization?.mode === 'auto_sort'
                                    ? 'Applied collection sort order across physical shelves'
                                    : 'Applied Shelf Organization Studio layout'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-medium text-content-muted whitespace-nowrap">
                              {primaryDate}
                            </span>
                            {canEdit && (
                              <DeleteHistoryButton
                                label={`Remove "${entry.title}" from history`}
                                onClick={() => handleDeleteEvents(entry.eventIds, entry.title)}
                                disabled={isEntryDeleting}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {feed.hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                isLoading={isLoadingMore}
              >
                Load older history
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Lightbox Sheet for Shelf Photo Previews */}
      <Sheet
        isOpen={Boolean(activePhoto)}
        onClose={() => setActivePhoto(null)}
        title={activePhoto?.caption || activePhoto?.groupName || 'Shelf Photo'}
        description={
          activePhoto
            ? [activePhoto.groupName || 'Full Setup', activePhoto.shelfName]
                .filter(Boolean)
                .join(' / ')
            : undefined
        }
        position="bottom"
        size="lg"
      >
        {activePhoto && (
          <div className="space-y-4">
            <img
              src={activePhoto.imageUrl}
              alt={activePhoto.caption || 'Shelf setup photo'}
              className="max-h-[70vh] w-full rounded-[--radius-card] object-contain bg-surface-sunken"
            />
            <div className="flex justify-end">
              <Button asChild variant="secondary" size="sm" onClick={() => setActivePhoto(null)}>
                <Link to="/?view=shelf">Open Shelf View →</Link>
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};

export default HistoryPage;
